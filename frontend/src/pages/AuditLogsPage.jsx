import React, { useState, useEffect } from 'react';
import { getAuditLogs } from '../api/admin';

const AuditLogsPage = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const token = localStorage.getItem('token') || localStorage.getItem('access_token');
                const data = await getAuditLogs(token);
                setLogs(data);
            } catch (err) {
                setError(err.message);
                console.error("Audit Logs Error:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, []);

    return (
        <div className="flex-1 p-8 bg-gray-900 overflow-y-auto">
            <div className="flex justify-between items-center mb-8 shrink-0">
                <h2 className="text-4xl font-extrabold text-white uppercase tracking-tighter">
                    Violation <span className="text-red-500">Audit Logs</span>
                </h2>
                <div className="bg-red-500/10 border border-red-500/20 px-5 py-2 rounded-full shadow-lg">
                    <span className="text-red-400 text-xs font-black font-mono tracking-widest">
                        TOTAL DETECTIONS: {logs.length}
                    </span>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500 mb-4"></div>
                    <p className="text-gray-500 font-mono text-sm">FETCHING EVIDENCE LOGS...</p>
                </div>
            ) : error ? (
                <div className="bg-red-600/20 border border-red-600 p-6 rounded-2xl text-red-200 font-medium">
                    ⚠️ Error: {error}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {logs.map((log) => (
                        <div key={log.id} className="bg-gray-800 border border-gray-700 rounded-3xl overflow-hidden shadow-2xl hover:scale-[1.02] transition-transform duration-300 group">
                            
                            <div className="relative h-56 bg-black overflow-hidden flex items-center justify-center">
                                {/* 🚨 FIX: Removed double http://localhost:8000/ prefix */}
                                <img 
                                    src={log.image_path} 
                                    alt="Violation Evidence"
                                    className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
                                    onError={(e) => {
                                        // 🚨 FIX: Remove reliance on external via.placeholder.com
                                        e.target.onerror = null; 
                                        e.target.className = "hidden"; // Hide broken image
                                        e.target.parentNode.innerHTML = `
                                            <div class="text-center p-4">
                                                <p class="text-red-500 font-black text-xs">IMAGE LOAD ERROR</p>
                                                <p class="text-gray-600 text-[10px] mt-2 font-mono break-all">${log.image_path}</p>
                                            </div>
                                        `;
                                    }}
                                />
                                <div className="absolute top-4 right-4 bg-red-600 text-white text-[9px] font-black px-3 py-1.5 rounded-full shadow-lg uppercase tracking-widest">
                                    Phone Detected
                                </div>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Teacher</p>
                                        <p className="text-white font-bold text-lg">{log.teacher_name || "Admin Alert"}</p>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-[10px] text-indigo-400 uppercase font-black tracking-widest">Classroom</p>
                                        <p className="text-white font-bold text-lg">{log.class_name || "Zone A"}</p>
                                    </div>
                                </div>
                                
                                <div className="pt-4 border-t border-gray-700/50 flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-tighter">
                                            {log.timestamp ? new Date(log.timestamp).toLocaleDateString() : 'N/A'}
                                        </span>
                                        <span className="text-xs font-mono text-gray-400 font-bold">
                                            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'N/A'}
                                        </span>
                                    </div>
                                    <a 
                                        href={log.image_path} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-[10px] bg-gray-700 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg transition-colors font-bold uppercase tracking-widest shadow-md"
                                    >
                                        Full Res
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AuditLogsPage;