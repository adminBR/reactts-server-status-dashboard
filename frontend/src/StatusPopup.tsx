import React from "react";

interface StatusCheck {
  id: number;
  service_id: number;
  status: "up" | "down";
  timestamp: string;
}

interface StatusPopupProps {
  visible: boolean;
  history: StatusCheck[];
}

const StatusPopup: React.FC<StatusPopupProps> = ({ visible, history }) => {
  return (
    visible && (
      <div className="absolute bottom-10 bg-gray-800 text-white p-4 rounded-md shadow-lg z-100 w-80">
        <h3 className="text-lg font-semibold mb-2">{history[0].id}</h3>
        {history.map((check, i) => (
          <div key={i} className="flex items-center mb-2">
            <span
              className={`w-3 h-3 rounded-full mr-2 ${
                check.status === "up" ? "bg-green-400" : "bg-red-400"
              }`}
            />
            <span>{new Date(check.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    )
  );
};

export default StatusPopup;
