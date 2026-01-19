import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Upload, FileSearch, BarChart2, Settings } from "lucide-react";

const Dashboard = () => {
  const { user, logout } = useAuth();

  // Side menu items (role-based visibility)
  const menuItems = [
    { path: "/upload", label: "Upload Statements", icon: <Upload />, roles: ["finance_analyst", "admin"] },
    { path: "/reconciliation", label: "Reconciliation", icon: <FileSearch />, roles: ["finance_analyst", "finance_manager", "auditor", "admin"] },
    { path: "/reports", label: "Reports", icon: <BarChart2 />, roles: ["finance_manager", "auditor", "admin"] },
    { path: "/settings", label: "Settings", icon: <Settings />, roles: ["admin"] },
  ];

  const visibleMenu = menuItems.filter(item => item.roles.includes(user?.role));

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-blue-600">Reconciliation</h1>
          <p className="text-sm text-gray-500">Welcome, {user?.role}</p>
        </div>
        <nav className="p-4 space-y-2">
          {visibleMenu.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 p-3 rounded-md hover:bg-blue-50 hover:text-blue-700 transition"
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
          <button
            onClick={logout}
            className="w-full text-left flex items-center gap-3 p-3 rounded-md hover:bg-red-50 hover:text-red-700 transition"
          >
            🚪 Logout
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Upload Card */}
          {user?.role === "finance_analyst" || user?.role === "admin" ? (
            <Link
              to="/upload"
              className="bg-green-50 border border-green-200 p-6 rounded-xl shadow hover:shadow-lg transition flex flex-col items-center justify-center text-center"
            >
              <Upload className="h-10 w-10 text-green-600 mb-3" />
              <h3 className="text-lg font-semibold">Upload Statements</h3>
              <p className="text-sm text-gray-600">Bank & Book files</p>
            </Link>
          ) : null}

          {/* Reconciliation Card */}
          <Link
            to="/reconciliation"
            className="bg-blue-50 border border-blue-200 p-6 rounded-xl shadow hover:shadow-lg transition flex flex-col items-center justify-center text-center"
          >
            <FileSearch className="h-10 w-10 text-blue-600 mb-3" />
            <h3 className="text-lg font-semibold">Reconciliation</h3>
            <p className="text-sm text-gray-600">Match transactions</p>
          </Link>

          {/* Reports Card */}
          {["finance_manager", "auditor", "admin"].includes(user?.role) ? (
            <Link
              to="/reports"
              className="bg-yellow-50 border border-yellow-200 p-6 rounded-xl shadow hover:shadow-lg transition flex flex-col items-center justify-center text-center"
            >
              <BarChart2 className="h-10 w-10 text-yellow-600 mb-3" />
              <h3 className="text-lg font-semibold">Reports</h3>
              <p className="text-sm text-gray-600">Download summaries</p>
            </Link>
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
