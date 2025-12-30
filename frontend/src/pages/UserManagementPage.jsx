import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { createTeacher, getAllTeachers, deleteTeacher } from '../api/admin'; 

// --- Helper component for the table row ---
const TeacherRow = ({ teacher, onDelete }) => (
    <tr className="border-b border-gray-700 hover:bg-gray-700 transition duration-150">
        <td className="py-3 px-4 font-medium text-indigo-300">{teacher.id}</td>
        <td className="py-3 px-4">{teacher.username}</td>
        <td className="py-3 px-4">{teacher.teacher_identifier}</td>
        <td className="py-3 px-4">{teacher.department}</td>
        <td className="py-3 px-4 text-green-400">{teacher.role}</td>
        <td className="py-3 px-4">
            <button 
                onClick={() => onDelete(teacher.id, teacher.username)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-md text-sm transition duration-150"
            >
                Delete
            </button>
        </td>
    </tr>
);

function UserManagementPage() {
    const { token } = useAuth(); 

    const [formData, setFormData] = useState({
        username: '',
        password: '',
        teacher_identifier: '',
        department: '',
    });
    
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [teachers, setTeachers] = useState([]);
    const [tableLoading, setTableLoading] = useState(false);

    // --- Data Fetching Logic ---
    const fetchTeachers = async () => {
        if (!token) return;
        setTableLoading(true);
        try {
            const data = await getAllTeachers(token);
            setTeachers(data);
        } catch (err) {
            console.error("Failed to fetch teachers:", err);
        } finally {
            setTableLoading(false);
        }
    };
    
    useEffect(() => {
        fetchTeachers();
    }, [token]);

    // --- Handlers ---
    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        if (!token) {
            setError("Authentication token missing.");
            setLoading(false);
            return;
        }

        try {
            const result = await createTeacher(formData, token); 
            setMessage(result.message);
            setFormData({ username: '', password: '', teacher_identifier: '', department: '' });
            await fetchTeachers();
        } catch (err) {
            setError(err.message || "Failed to create teacher account.");
        } finally {
            setLoading(false);
        }
    };
    
    const handleDelete = async (teacherId, teacherUsername) => {
        if (!window.confirm(`Are you sure you want to delete '${teacherUsername}'?`)) return;

        setTableLoading(true);
        try {
            const result = await deleteTeacher(teacherId, token);
            setMessage(result.message);
            await fetchTeachers();
        } catch (err) {
            setError(err.message || "Failed to delete teacher.");
        } finally {
            setTableLoading(false);
        }
    };

    return (
        /* 🚨 FIX: h-screen and overflow-hidden ensures the page itself doesn't scroll, only the table container does */
        <div className="flex flex-col h-screen p-8 bg-gray-900 text-white overflow-hidden">
            <h2 className="text-4xl font-extrabold text-indigo-400 mb-6 shrink-0">👥 User Management</h2>
            
            {/* --- Form Section --- */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl mb-8 max-w-4xl mx-auto w-full shrink-0">
                <h3 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">Create New Teacher Account</h3>
                
                {message && (<div className="bg-green-600/20 border border-green-500 text-green-400 p-3 rounded-md mb-4">{message}</div>)}
                {error && (<div className="bg-red-600/20 border border-red-500 text-red-400 p-3 rounded-md mb-4">{error}</div>)}

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" name="username" placeholder="Teacher Name" value={formData.username} onChange={handleChange} className="p-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                    <input type="text" name="teacher_identifier" placeholder="Unique Teacher ID" value={formData.teacher_identifier} onChange={handleChange} className="p-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                    <input type="text" name="department" placeholder="Department" value={formData.department} onChange={handleChange} className="p-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                    <input type="password" name="password" placeholder="Password (Min 8 chars)" value={formData.password} onChange={handleChange} className="p-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required />

                    <button
                        type="submit"
                        className={`md:col-span-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={loading}
                    >
                        {loading ? 'Creating...' : 'Create Teacher'}
                    </button>
                </form>
            </div>

            {/* --- Table Section --- */}
            <div className="flex flex-col flex-1 min-h-0">
                <h3 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2 shrink-0">Existing Teachers</h3>

                {tableLoading && <p className="text-indigo-400 animate-pulse">Updating teacher list...</p>}
                
                {!tableLoading && teachers.length === 0 && (
                    <p className="text-gray-500">No teacher accounts found.</p>
                )}

                {teachers.length > 0 && (
                    /* 🚨 FIX: overflow-y-auto enables the scrollbar here */
                    <div className="flex-1 overflow-y-auto bg-gray-800 rounded-lg shadow-xl border border-gray-700">
                        <table className="min-w-full text-left text-gray-300">
                            {/* 🚨 FIX: sticky top-0 keeps headers visible while scrolling */}
                            <thead className="sticky top-0 bg-gray-700 shadow-md">
                                <tr className="uppercase text-xs font-semibold text-gray-200">
                                    <th className="py-4 px-4">ID</th>
                                    <th className="py-4 px-4">Username</th>
                                    <th className="py-4 px-4">Teacher ID</th>
                                    <th className="py-4 px-4">Department</th>
                                    <th className="py-4 px-4">Role</th>
                                    <th className="py-4 px-4">Action</th> 
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {teachers.map((teacher) => (
                                    <TeacherRow 
                                        key={teacher.id} 
                                        teacher={teacher} 
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

export default UserManagementPage;