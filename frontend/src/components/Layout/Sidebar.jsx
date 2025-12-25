import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: "📊" },
    { name: "User Management", path: "/dashboard/users", icon: "👥" },
    { name: "Class Setup", path: "/dashboard/setup", icon: "⚙️" },
    { name: "Audit Logs", path: "/dashboard/logs", icon: "📜" },
];

function Sidebar({ onLogout }) {
    const location = useLocation();

    return (
        <div className="w-64 bg-gray-800 flex flex-col h-full text-white">
            <div className="flex items-center justify-center h-20 shadow-md">
                <span className="text-xl font-bold text-indigo-400">Monitor Admin</span>
            </div>
            <nav className="flex-1 mt-4">
                <ul>
                    {navItems.map((item) => (
                        <li key={item.path} className="mb-2">
                            <Link
                                to={item.path}
                                className={`flex items-center p-4 text-sm font-medium transition duration-150 ${
                                    location.pathname === item.path 
                                        ? 'bg-indigo-600 text-white rounded-r-full' 
                                        : 'hover:bg-gray-700 text-gray-300'
                                }`}
                            >
                                <span className="mr-3">{item.icon}</span>
                                {item.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
            <div className="p-4 border-t border-gray-700">
                <button
                    onClick={onLogout}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded transition duration-150"
                >
                    Logout
                </button>
            </div>
        </div>
    );
}

export default Sidebar;