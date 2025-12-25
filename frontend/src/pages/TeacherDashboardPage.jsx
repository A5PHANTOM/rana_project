import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import DetectionEngine from '../components/DetectionEngine';

function TeacherDashboardPage() {
    const { token, logout, user } = useAuth();
    const [qrInput, setQrInput] = useState('');
    const [sessionInfo, setSessionInfo] = useState(null);
    const [notifications, setNotifications] = useState([]); 
    const [latestAlert, setLatestAlert] = useState(null); // 🔔 State for pop-up notification
    const [error, setError] = useState('');
    const imageRef = useRef(null);

    // 1. WebSocket Listener for Real-Time Alerts
    useEffect(() => {
        let socket;
        const targetId = user?.id || 1; 
        
        if (sessionInfo) {
            socket = new WebSocket(`ws://localhost:8000/ws/alerts/${targetId}`);
            
            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Add newest violation to the top of the history
                    setNotifications(prev => [data, ...prev]);
                    
                    // 🚨 Trigger pop-up notification
                    setLatestAlert(data);
                    setTimeout(() => setLatestAlert(null), 5000); // Auto-hide after 5s
                } catch (e) {
                    console.error("Socket error", e);
                }
            };
            
            socket.onerror = () => console.error("WebSocket Alert Disconnected");
        }
        return () => socket?.close();
    }, [sessionInfo, user]);

    const handleSignIn = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch('http://127.0.0.1:8000/api/teacher/sign-in', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ qr_payload: qrInput.trim() }),
            });
            
            if (res.ok) {
                const data = await res.json();
                setSessionInfo(data); 
            } else {
                setError("Invalid QR Code.");
            }
        } catch (err) {
            setError("Backend unreachable.");
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8 font-sans relative">
            {/* 🔔 FLOATING NOTIFICATION POP-UP */}
            {latestAlert && (
                <div className="fixed top-5 right-5 z-50 animate-bounce bg-red-600 p-4 rounded-lg shadow-2xl border-2 border-white flex items-center gap-4 max-w-sm">
                    {latestAlert.image_url && (
                        <img 
                            src={`http://localhost:8000/${latestAlert.image_url}`} 
                            className="w-16 h-16 object-cover rounded border border-white/50"
                            alt="Evidence"
                        />
                    )}
                    <div>
                        <h4 className="font-bold text-white uppercase text-xs">New Violation!</h4>
                        <p className="text-sm font-semibold">{latestAlert.message}</p>
                    </div>
                </div>
            )}

            <header className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
                <h2 className="text-2xl font-bold text-indigo-400">Class Monitor v2.5</h2>
                <div className="text-sm text-gray-400">
                    {user?.username ? `Teacher: ${user.username}` : "Identity: Bypassed"}
                    <button onClick={logout} className="ml-4 bg-red-600 px-3 py-1 rounded hover:bg-red-700 transition">Logout</button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
                        <h3 className="font-bold mb-4 text-indigo-300">Class Setup</h3>
                        <form onSubmit={handleSignIn} className="space-y-4">
                            <input 
                                value={qrInput} 
                                onChange={e => setQrInput(e.target.value)} 
                                placeholder="QR Payload UUID" 
                                className="w-full bg-gray-700 p-3 rounded text-sm border border-transparent focus:border-indigo-500 outline-none" 
                            />
                            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 py-3 rounded font-bold transition">
                                Start Monitoring
                            </button>
                        </form>
                        {error && <p className="text-red-500 text-xs mt-3 font-semibold">{error}</p>}
                    </div>

                    {/* HISTORY SIDEBAR WITH IMAGE FIX */}
                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 h-[550px] flex flex-col shadow-inner">
                        <h3 className="font-bold mb-4 text-red-400 border-b border-gray-700 pb-2 flex justify-between items-center">
                            <span>Violation History</span>
                            <span className="bg-red-950 text-red-400 text-xs px-2 py-0.5 rounded-full">{notifications.length}</span>
                        </h3>
                        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                            {notifications.length === 0 ? (
                                <p className="text-gray-500 italic text-sm text-center mt-10">Waiting for detections...</p>
                            ) : (
                                notifications.map((note, idx) => (
                                    <div key={idx} className="bg-gray-900 rounded-lg overflow-hidden border border-red-900/30 shadow-md">
                                        {note.image_url && (
                                            <img 
                                                src={`http://localhost:8000/${note.image_url}`} 
                                                alt="Violation"
                                                className="w-full h-32 object-cover cursor-zoom-in hover:scale-105 transition-transform duration-300" 
                                                onClick={() => window.open(`http://localhost:8000/${note.image_url}`, '_blank')} 
                                            />
                                        )}
                                        <div className="p-3 text-xs bg-gray-900/80">
                                            <p className="text-indigo-400 uppercase font-mono mb-1">
                                                {note.timestamp ? new Date(note.timestamp).toLocaleTimeString() : 'Recent'}
                                            </p>
                                            <p className="font-semibold text-gray-200 leading-tight">{note.message}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* MAIN FEED */}
                <div className="lg:col-span-3 bg-gray-800 rounded-xl p-4 relative border border-gray-700 min-h-[500px] flex items-center justify-center overflow-hidden shadow-2xl">
                    {sessionInfo ? (
                        <div className="relative w-full h-full flex items-center justify-center bg-black rounded-lg border-2 border-indigo-900/20">
                            <img 
                                ref={imageRef}
                                key={sessionInfo.class_ip}
                                src={`http://${sessionInfo.class_ip}:81/stream`}
                                crossOrigin="anonymous" 
                                className="max-w-full max-h-full block object-contain shadow-2xl"
                                alt="Live Feed"
                                onError={() => setError("Camera connection lost.")}
                            />
                            <DetectionEngine 
                                key={`ai-${sessionInfo.class_id}`} 
                                imageRef={imageRef} 
                                classId={sessionInfo.class_id || sessionInfo.id || 1}
                                teacherId={user?.id || 1} 
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center opacity-30 text-gray-500">
                            <span className="text-8xl mb-4">🎥</span>
                            <p className="text-xl font-medium">Ready for Class Stream</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default TeacherDashboardPage;