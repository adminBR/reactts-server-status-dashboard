import React, { useState, useEffect, useRef } from "react";
import axios, { AxiosInstance } from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface Service {
  id: number;
  name: string;
  url: string;
  type: string;
}

interface StatusCheck {
  id: number;
  service_id: number;
  status: "up" | "down";
  timestamp: string;
}

interface ServiceStatus extends Service {
  history: StatusCheck[];
}

interface tempinter {
  hour: string;
  checks: StatusCheck[];
}

const API_URL = "http://192.168.1.64:5011";
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
});

const ServiceStatusDashboard: React.FC = () => {
  const [serviceStatuses, setServiceStatuses] = useState<ServiceStatus[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<"running" | "stopped">(
    "stopped"
  );

  const [ishovering, setIsHovering] = useState<boolean>(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const divRef = useRef<HTMLDivElement | null>(null);

  const [tempstatus, settempstatus] = useState<tempinter | null>({
    hour: "",
    checks: [],
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (divRef.current) {
      // Get the mouse position relative to the viewport
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      // Get the position of the div relative to the viewport

      setPosition({ x: mouseX, y: mouseY });
      console.log({ x: mouseX, y: mouseY });
    } else {
      setIsHovering(false);
      console.log("not hovering");
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [servicesResponse, schedulerStatusResponse] = await Promise.all([
          api.get<Service[]>(`/services/`),
          api.get<{ status: "running" | "stopped" }>(`/scheduler/status`),
        ]);

        const services = servicesResponse.data;
        setSchedulerStatus(schedulerStatusResponse.data.status);

        const serviceStatusesWithHistory = await Promise.all(
          services.map(async (service) => {
            const historyResponse = await api.get<StatusCheck[]>(
              `/status-checks/${service.id}`
            );
            console.log(historyResponse);
            return { ...service, history: historyResponse.data };
          })
        );

        setServiceStatuses(serviceStatusesWithHistory);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000); // Refresh every 5 minutes

    return () => clearInterval(interval);
  }, []);

  const toggleScheduler = async () => {
    try {
      const endpoint =
        schedulerStatus === "running" ? "/scheduler/stop" : "/scheduler/start";
      await api.post(endpoint);
      setSchedulerStatus(schedulerStatus === "running" ? "stopped" : "running");
    } catch (error) {
      console.error("Error toggling scheduler:", error);
    }
  };

  const StatusBadge: React.FC<{ status: "up" | "down" }> = ({ status }) => (
    <Badge
      className={`px-2 py-1  text-xs font-semibold ${
        status === "up"
          ? "bg-green-400 text-gray-900 hover:bg-green-800"
          : "bg-red-400 text-gray-900 hover:bg-red-800"
      }`}
    >
      {status.toUpperCase()}
    </Badge>
  );

  const UptimeHeatmap: React.FC<{ history: StatusCheck[] }> = ({ history }) => {
    const now = new Date();
    const last24Hours = [...Array(24)].map(
      (_, i) =>
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          now.getHours() - i,
          0,
          0
        )
    );

    const heatmapData = last24Hours.map((hour) => {
      const hourChecks = history.filter(
        (check) => new Date(check.timestamp).getHours() === hour.getHours()
      );
      const hasDownCheck = hourChecks.some((check) => check.status === "down");
      return {
        hour: format(hour, "HH:00"),
        status: hasDownCheck
          ? "down"
          : hourChecks.length > 0
          ? "up"
          : "no-data",
        checks: hourChecks,
      };
    });

    return (
      <div className="grid grid-cols-24 gap-1 mt-4 ">
        {heatmapData.reverse().map((hourData) => (
          <div
            ref={divRef}
            className={`h-6 rounded-sm  cursor-pointer ${
              hourData.status === "up"
                ? "bg-green-400 hover:bg-green-600"
                : hourData.status === "down"
                ? "bg-red-400 hover:bg-red-600"
                : "bg-gray-400 hover:bg-gray-500"
            }`}
            onMouseDown={(e) => {
              console.log("on");
              setIsHovering(true);
              handleMouseMove(e);
              settempstatus({
                hour: hourData.hour,
                checks: hourData.checks,
              });
            }}
            title={hourData.hour}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="w-screen max-w-screen h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 text-gray-100 p-4 sm:p-8 overflow-x-hidden">
      <div className="container mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-blue-300">
            Monitor de atividade
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-lg">Agendador: {schedulerStatus}</span>
            <Switch
              checked={schedulerStatus === "running"}
              onCheckedChange={toggleScheduler}
              className="bg-blue-700"
            />
            <Button onClick={async () => await api.get(`/testrun`)}>
              Verificar manualmente
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {serviceStatuses.map((service) => (
            <Card
              key={service.id}
              className="bg-gray-800 bg-opacity-30 backdrop-filter backdrop-blur-lg border border-blue-500/30 rounded-xl shadow-lg transition-all duration-300"
            >
              <CardHeader className="bg-gray-800 bg-opacity-50 border-b border-blue-500/30">
                <CardTitle className="flex justify-between items-center text-xl font-semibold text-blue-300">
                  <span className="truncate mr-2">{service.name}</span>
                  <StatusBadge status={service.history[0]?.status || "down"} />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-sm text-gray-400 mb-2">
                  Resultado ultimas 24 horas:
                </p>
                <UptimeHeatmap history={service.history} />
                <div className="mt-4 text-sm text-gray-400">
                  <p>Tipo: {service.type}</p>
                  <p className="truncate">URL: {service.url}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      {ishovering && (
        <div
          className={`fixed top-5 bg-gray-800 text-white p-4 rounded-md shadow-lg z-20 w-80 ${
            position.x > window.innerWidth / 2 ? "left-5" : "right-5"
          }`}
        >
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold">{tempstatus?.hour}</h3>
            <button
              className="text-white bg-gray-600 hover:bg-gray-700 rounded-full w-6 h-6 flex items-center justify-center"
              onClick={() => setIsHovering(false)}
            >
              &times;
            </button>
          </div>
          {tempstatus?.checks.map((check, i) => (
            <div key={i} className="flex items-center mb-2">
              <span
                className={`w-3 h-3 rounded-full mr-2 ${
                  check.status === "up" ? "bg-green-400" : "bg-red-400"
                }`}
              />
              <span>{format(new Date(check.timestamp), "HH:mm:ss")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceStatusDashboard;
