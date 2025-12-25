import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
// 🚨 Import new API functions
import { createClass, getAllClassesData, deleteClass } from '../api/admin'; 

import QRCode from 'react-qr-code'; 


// Helper component for the table row
const ClassRow = ({ classroom, onDelete }) => (
    <tr className="border-b border-gray-700 hover:bg-gray-700 transition duration-150">
        <td className="py-3 px-4 font-medium text-indigo-300">{classroom.id}</td>
        <td className="py-3 px-4">{classroom.name}</td>
        <td className="py-3 px-4">{classroom.esp32_ip}</td>
        {/* Display QR Payload text */}
        <td className="py-3 px-4 break-all text-sm text-gray-400">{classroom.permanent_qr_payload}</td>
        
        {/* QR CODE IMAGE */}
        <td className="py-3 px-4">
            <div className="bg-white p-1 inline-block rounded-sm">
                {/* 🚨 Ensure the QR code renders the permanent_qr_payload */}
                <QRCode value={classroom.permanent_qr_payload || "Error"} size={50} />
            </div>
        </td>
        
        {/* DELETE BUTTON */}
        <td className="py-3 px-4">
            <button 
                onClick={() => onDelete(classroom.id, classroom.name)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-md text-sm transition duration-150"
            >
                Delete
            </button>
        </td>
    </tr>
);

function ClassSetupPage() {
    const { token } = useAuth();
    const [formData, setFormData] = useState({ name: '', esp32_ip: '' });
    const [loading, setLoading] = useState(false);
    
    // State for messages/errors (simple strings)
    const [message, setMessage] = useState('');
    const [error, setError] = useState(''); 
    
    // QR Code generation states
    const [qrPayload, setQrPayload] = useState(null); 
    const [createdClassName, setCreatedClassName] = useState(''); 
    
    // 🚨 NEW STATE: For displaying existing classes
    const [classes, setClasses] = useState([]);
    const [tableLoading, setTableLoading] = useState(false);


    // --- Data Fetching Logic ---
    const fetchClasses = async () => {
        if (!token) return;
        setTableLoading(true);
        try {
            const data = await getAllClassesData(token);
            // Assuming data returns a list of objects with { id, name, esp32_ip, permanent_qr_payload }
            setClasses(data);
        } catch (err) {
            console.error("Failed to fetch classes:", err);
            setError("Failed to load existing classes.");
        } finally {
            setTableLoading(false);
        }
    };
    
    // EFFECT: Fetch classes list on component mount and token change
    useEffect(() => {
        fetchClasses();
    }, [token]);


    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setQrPayload(null);
        setCreatedClassName('');
        setLoading(true);

        if (!token) {
            setError("Authentication token missing. Please log in again.");
            setLoading(false);
            return;
        }

        try {
            const nameBeforeSubmit = formData.name; 
            const result = await createClass(formData, token);
            
            setMessage(result.message);
            setQrPayload(result.qr_payload); 
            setCreatedClassName(nameBeforeSubmit); 
            
            setFormData({ name: '', esp32_ip: '' }); 

            // 🚨 REFRESH: Fetch the updated list of classes
            await fetchClasses();

        } catch (err) {
            setError(err.message || "Failed to create class.");
        } finally {
            setLoading(false);
        }
    };
    
    // 🚨 NEW: Delete Class Handler
    const handleDelete = async (classId, className) => {
        if (!window.confirm(`Are you sure you want to delete class '${className}' (ID: ${classId})? This will unassign all associated teachers and cannot be undone.`)) {
            return;
        }

        setTableLoading(true);
        setError('');
        setMessage('');

        try {
            const result = await deleteClass(classId, token);
            setMessage(result.message);
            
            // Clear the currently displayed QR if it belonged to the deleted class
            if (qrPayload && classes.find(c => c.id === classId)?.permanent_qr_payload === qrPayload) {
                setQrPayload(null);
                setCreatedClassName('');
            }
            
            // REFRESH the list after deletion
            await fetchClasses();
        } catch (err) {
            setError(err.message || "Failed to delete class.");
        } finally {
            setTableLoading(false);
        }
    };


    return (
        <div className="flex-1 p-8 bg-gray-900 text-white">
            <h2 className="text-4xl font-extrabold text-indigo-400 mb-6">⚙️ Class & Camera Setup</h2>
            
            {/* --- Class Creation Form (Top Section) --- */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl mb-8 flex">
                <div className="w-1/2 pr-8 border-r border-gray-700">
                    <h3 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">New Classroom Setup</h3>
                    
                    {message && <div className="bg-green-600 p-3 rounded-md text-white font-medium mb-4">{message}</div>}
                    {error && <div className="bg-red-600 p-3 rounded-md text-white font-medium mb-4">{error}</div>}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Class Name (e.g., CSE 301)</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full mt-1 p-2 border border-gray-600 rounded-md bg-gray-700 text-white" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300">ESP32 Camera IP (e.g., 192.168.1.101)</label>
                            <input type="text" name="esp32_ip" value={formData.esp32_ip} onChange={handleChange} className="w-full mt-1 p-2 border border-gray-600 rounded-md bg-gray-700 text-white" required />
                        </div>

                        <button type="submit" className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={loading}>
                            {loading ? 'Creating...' : 'Create Class & Generate QR'}
                        </button>
                    </form>
                </div>
                
                {/* --- QR Code Display (Top Section) --- */}
                <div className="w-1/2 pl-8 flex flex-col items-center justify-center">
                    <h3 className="text-2xl font-bold mb-4 text-indigo-400">Generated QR Code</h3>
                    
                    {qrPayload ? (
                        <div className="text-center">
                            <QRCode value={qrPayload} size={200} className="bg-white p-4 rounded-md"/>
                            
                            <p className="mt-4 text-sm text-gray-400 break-all">
                                **Payload:** {qrPayload}
                            </p>
                            <p className="mt-2 text-sm text-green-400">
                                This code must be printed and placed in Class **{createdClassName}**.
                            </p>
                        </div>
                    ) : (
                        <p className="text-gray-500">Submit the form to generate the unique QR payload.</p>
                    )}
                </div>
            </div>
            
            {/* ------------------------------------------------------------------- */}
            {/* --- Existing Classes Table (Bottom Section) --- */}
            {/* ------------------------------------------------------------------- */}
            <div className="mt-10">
                <h3 className="text-3xl font-bold text-indigo-400 mb-4 border-b border-gray-700 pb-2">Existing Classes</h3>

                {tableLoading && <p className="text-indigo-400">Loading classes...</p>}
                
                {!tableLoading && classes.length === 0 && (
                    <p className="text-gray-500">No classroom setups found in the database.</p>
                )}

                {classes.length > 0 && (
                    <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-xl">
                        <table className="min-w-full text-left text-gray-300">
                            <thead>
                                <tr className="uppercase text-sm bg-gray-700 text-gray-200">
                                    <th className="py-3 px-4">ID</th>
                                    <th className="py-3 px-4">Name</th>
                                    <th className="py-3 px-4">IP Address</th>
                                    <th className="py-3 px-4">QR Payload</th>
                                    <th className="py-3 px-4">QR Image</th>
                                    <th className="py-3 px-4">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classes.map((classroom) => (
                                    <ClassRow 
                                        key={classroom.id} 
                                        classroom={classroom} 
                                        onDelete={handleDelete} 
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ClassSetupPage;