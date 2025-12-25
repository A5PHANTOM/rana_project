import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Layout/Sidebar';
import UserManagementPage from './UserManagementPage'; 
import ClassSetupPage from './ClassSetupPage';
import { getAllClassesData } from '../api/admin'; //
import AuditLogsPage from './AuditLogsPage';
const AdminMonitorGrid = () => {
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tokenReady, setTokenReady] = useState(false);

    // 1. SESSION SYNC: Polls for token to handle redirect race conditions
    useEffect(() => {
        const checkAuth = () => {
            const token = localStorage.getItem('token') || localStorage.getItem('access_token');
            if (token) {
                setTokenReady(true);
                return true;
            }
            return false;
        };

        if (!checkAuth()) {
            const interval = setInterval(() => {
                if (checkAuth()) clearInterval(interval);
            }, 200); 
            return () => clearInterval(interval);
        }
    }, []);

    // 2. DATA LOAD: Fetches classrooms once authenticated
    useEffect(() => {
        if (!tokenReady) return;

        const fetchClasses = async () => {
            try {
                const token = localStorage.getItem('token') || localStorage.getItem('access_token');
                const data = await getAllClassesData(token);
                setClasses(data);
                if (data.length > 0) setSelectedClass(data[0]); 
            } catch (err) {
                console.error("Dashboard Fetch Error:", err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchClasses();
    }, [tokenReady]);

    // 3. SWITCH HANDLER: Changes the live feed selection
    const handleSwitch = (e) => {
        const id = parseInt(e.target.value);
        const cls = classes.find(c => c.id === id);
        if (cls) setSelectedClass(cls);
    };

    return (
        <div className="flex-1 p-4 flex flex-col h-screen overflow-hidden bg-gray-900">
            {/* Header Area */}
            <div className="flex justify-between items-center mb-4 shrink-0">
                <h2 className="text-3xl font-black text-white uppercase tracking-tight">
                    Live Monitor <span className="text-indigo-500">Grid</span>
                </h2>
                
                <div className="flex items-center space-x-3 bg-gray-800 p-2 rounded-xl border border-gray-700 shadow-lg">
                    <span className="text-[10px] text-indigo-400 font-bold uppercase ml-2">Feed:</span>
                    <select 
                        className="bg-gray-700 text-white text-sm p-2 rounded-lg outline-none border border-gray-600 focus:border-indigo-500 min-w-[160px]"
                        onChange={handleSwitch}
                        value={selectedClass?.id || ""}
                    >
                        {classes.map(cls => (
                            <option key={cls.id} value={cls.id}>{cls.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 🚨 BIG VIDEO CONTAINER */}
            <div className="flex-1 border-2 border-indigo-500/20 rounded-[2rem] bg-black relative flex items-center justify-center overflow-hidden shadow-2xl">
                {selectedClass ? (
                    <div className="w-full h-full relative flex items-center justify-center bg-black">
                        {/* Overlay Label */}
                        <div className="absolute top-6 left-6 z-20 bg-black/80 px-5 py-2 rounded-full text-[11px] font-mono text-green-400 border border-green-500/30 backdrop-blur-md shadow-lg">
                            ● LIVE: {selectedClass.name} | {selectedClass.esp32_ip}
                        </div>
                        
                        {/* 🚨 THE IMAGE FIX: max-w-none and object-contain for maximum size */}
                        <img 
                            key={selectedClass.id} 
                            src={`http://${selectedClass.esp32_ip}:81/stream`}
                            className="w-full h-full object-contain z-10" 
                            alt="Live Camera Feed"
                            onError={(e) => {
                                e.target.src = "https://via.placeholder.com/1280x720?text=Camera+Stream+Offline";
                            }}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-indigo-500 mb-6"></div>
                        <p className="text-gray-500 font-mono text-xs uppercase tracking-[0.2em]">
                            {!tokenReady ? "Syncing Credentials..." : "Accessing Class Feed..."}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ----------------------------------------------------------------------
// Main Dashboard Layout
// ----------------------------------------------------------------------
function DashboardPage() {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.clear();
        navigate('/', { replace: true });
    };

    return (
        <div className="flex h-screen bg-gray-900 overflow-hidden">
            <Sidebar onLogout={handleLogout} />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Routes>
                    <Route path="/" element={<AdminMonitorGrid />} />
                    <Route path="/users" element={<UserManagementPage />} />
                    <Route path="/setup" element={<ClassSetupPage />} />
                    <Route path="/logs" element={<AuditLogsPage />} />
                </Routes>
            </div>
        </div>
    );
}

export default DashboardPage;