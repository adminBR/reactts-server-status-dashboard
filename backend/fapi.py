import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from datetime import datetime, timedelta
import psycopg2
import aiohttp
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler

app = FastAPI()

# CORS settings
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pg_db_params = {
    'host': '192.168.1.64',
    'port': '8432',
    'user': 'postgres',
    'password': 'postgres',
    'database': 'dashboard-page',
}

def pgRunQuery(query: str):
    result = []
    try:
        with psycopg2.connect(**pg_db_params) as connection:
            with connection.cursor() as cursor:
                cursor.execute(query)
                if cursor.description:
                    rows = cursor.fetchall()
                    column_names = [desc[0] for desc in cursor.description]
                    result = [dict(zip(column_names, row)) for row in rows]
                connection.commit()
    except Exception as e:
        print(f"Error in pgRunQuery: {e}")
    return result

# Pydantic models
class ServiceCreate(BaseModel):
    name: str
    url: str
    type: str

class ServiceResponse(ServiceCreate):
    id: int

    class Config:
        orm_mode = True

class StatusCheckCreate(BaseModel):
    service_id: int
    status: str

class StatusCheckResponse(StatusCheckCreate):
    id: int
    timestamp: datetime

    class Config:
        orm_mode = True

# Scheduler
scheduler = AsyncIOScheduler()
scheduler_running = False

async def check_service_status(service_id: int, url: str):
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=10) as response:
                status = "up" if response.status < 400 else "down"
    except:
        status = "down"

    query = f"""
    INSERT INTO status_checks (service_id, status, timestamp) 
    VALUES ({service_id}, '{status}', '{datetime.now()}');
    """
    print("checking service:",service_id)
    pgRunQuery(query)

async def check_all_services():
    services = pgRunQuery("SELECT id, url FROM services;")
    tasks = [check_service_status(service['id'], service['url']) for service in services]
    await asyncio.gather(*tasks)

# API endpoints
@app.get("/ping")
def ping():
    return "pong"

@app.get("/testrun")
async def test_run():
    await check_all_services()
    return 

@app.post("/services/", response_model=ServiceResponse)
def create_service(service: ServiceCreate):
    query = f"""
    INSERT INTO services (name, url, type) 
    VALUES ('{service.name}', '{service.url}', '{service.type}')
    RETURNING id, name, url, type;
    """
    result = pgRunQuery(query)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create service")
    return result[0]

@app.get("/services/", response_model=List[ServiceResponse])
def read_services(skip: int = 0, limit: int = 100):
    query = f"SELECT id, name, url, type FROM services order by id OFFSET {skip} LIMIT {limit};"
    result = pgRunQuery(query)
    return result

@app.post("/status-checks/", response_model=StatusCheckResponse)
def create_status_check(status_check: StatusCheckCreate):
    query = f"""
    INSERT INTO status_checks (service_id, status, timestamp) 
    VALUES ({status_check.service_id}, '{status_check.status}', '{datetime.utcnow()}')
    RETURNING id, service_id, status, timestamp;
    """
    result = pgRunQuery(query)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create status check")
    return result[0]

@app.get("/status-checks/{service_id}", response_model=List[StatusCheckResponse])
def read_status_checks(service_id: int):
    twenty_four_hours_ago = datetime.now() - timedelta(hours=24)
    query = f"""
    SELECT id, service_id, status, timestamp 
    FROM status_checks 
    WHERE service_id = {service_id} 
    AND timestamp >= '{twenty_four_hours_ago}' 
    ORDER BY timestamp DESC;
    """
    result = pgRunQuery(query)
    return result

@app.post("/scheduler/start")
async def start_scheduler():
    global scheduler_running
    if not scheduler_running:
        scheduler.add_job(check_all_services, 'interval', minutes=5)
        scheduler.start()
        scheduler_running = True
        return {"message": "Scheduler started"}
    return {"message": "Scheduler is already running"}

@app.post("/scheduler/stop")
async def stop_scheduler():
    global scheduler_running
    if scheduler_running:
        scheduler.shutdown()
        scheduler_running = False
        return {"message": "Scheduler stopped"}
    return {"message": "Scheduler is not running"}

@app.get("/scheduler/status")
async def scheduler_status():
    return {"status": "running" if scheduler_running else "stopped"}

# Run the application
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
    start_scheduler()