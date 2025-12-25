import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
// 🚨 Import deleteTeacher
import { createTeacher, getAllTeachers, deleteTeacher } from '../api/admin'; 

// Helper component for the table row
// 🚨 MODIFIED: Now accepts onDelete function
const TeacherRow = ({ teacher, onDelete }) => (
    <tr className="border-b border-gray-700 hover:bg-gray-700 transition duration-150">
        <td className="py-3 px-4 font-medium text-indigo-300">{teacher.id}</td>
        <td className="py-3 px-4">{teacher.username}</td>
        <td className="py-3 px-4">{teacher.teacher_identifier}</td>
        <td className="py-3 px-4">{teacher.department}</td>
        <td className="py-3 px-4 text-green-400">{teacher.role}</td>
        {/* 🚨 NEW: Delete Button Column */}
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
    
    // State for managing UI status
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    // State: To store the list of existing teachers
    const [teachers, setTeachers] = useState([]);
    const [tableLoading, setTableLoading] = useState(false);

    // --- Data Fetching Logic (Called on Mount and Refresh) ---
    const fetchTeachers = async () => {
        if (!token) return;
        setTableLoading(true);
        try {
            const data = await getAllTeachers(token);
            setTeachers(data);
        } catch (err) {
            console.error("Failed to fetch teachers:", err);
            // We set an error state here if needed, but often silent failure is preferred for background fetching.
        } finally {
            setTableLoading(false);
        }
    };
    
    // EFFECT: Fetch teachers list on component mount
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
            setError("Authentication token expired. Please log out and log back in.");
            setLoading(false);
            return;
        }
        if (formData.password.length < 8) {
            setError("Password must be at least 8 characters long.");
            setLoading(false);
            return;
        }

        try {
            const payload = { ...formData };
            const result = await createTeacher(payload, token); 
            setMessage(result.message);
            
            // Clear the form fields after successful creation
            setFormData({ username: '', password: '', teacher_identifier: '', department: '' });

            // REFRESH: Fetch the updated list of teachers
            await fetchTeachers();

        } catch (err) {
            setError(err.message || "Failed to create teacher account.");
        } finally {
            setLoading(false);
        }
    };
    
    // 🚨 NEW: Delete Teacher Handler
    const handleDelete = async (teacherId, teacherUsername) => {
        if (!window.confirm(`Are you sure you want to delete teacher '${teacherUsername}' (ID: ${teacherId})? This action cannot be undone and will delete all associated class assignments.`)) {
            return;
        }

        setTableLoading(true); // Show loading indicator during deletion
        setError('');
        setMessage('');

        try {
            const result = await deleteTeacher(teacherId, token);
            setMessage(result.message);
            
            // REFRESH the list after deletion
            await fetchTeachers();
        } catch (err) {
            setError(err.message || "Failed to delete teacher.");
        } finally {
            setTableLoading(false);
        }
    };


    // --- Render ---
    return (
        <div className="flex-1 p-8 bg-gray-900 text-white">
            <h2 className="text-4xl font-extrabold text-indigo-400 mb-6">👥 User Management</h2>
            
            {/* --- Teacher Creation Form (Remains the same) --- */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl mb-8 max-w-xl mx-auto">
                <h3 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">Create New Teacher Account</h3>
                
                {message && (<div className="bg-green-600 p-3 rounded-md text-white font-medium mb-4">{message}</div>)}
                {error && (<div className="bg-red-600 p-3 rounded-md text-white font-medium mb-4">{error}</div>)}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* ... (input fields) ... */}
                    <div><label className="block text-sm font-medium text-gray-300">Teacher Name</label><input type="text" name="username" value={formData.username} onChange={handleChange} className="w-full mt-1 p-2 border border-gray-600 rounded-md bg-gray-700 text-white" required /></div>
                    <div><label className="block text-sm font-medium text-gray-300">Teacher ID (Unique)</label><input type="text" name="teacher_identifier" value={formData.teacher_identifier} onChange={handleChange} className="w-full mt-1 p-2 border border-gray-600 rounded-md bg-gray-700 text-white" required /></div>
                    <div><label className="block text-sm font-medium text-gray-300">Department</label><input type="text" name="department" value={formData.department} onChange={handleChange} className="w-full mt-1 p-2 border border-gray-600 rounded-md bg-gray-700 text-white" required /></div>
                    <div><label className="block text-sm font-medium text-gray-300">Password</label><input type="password" name="password" value={formData.password} onChange={handleChange} className="w-full mt-1 p-2 border border-gray-600 rounded-md bg-gray-700 text-white" required /></div>

                    <button
                        type="submit"
                        className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 ${loading || !token ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={loading || !token}
                    >
                        {loading ? 'Creating...' : 'Create Teacher'}
                    </button>
                </form>
            </div>

            {/* --- Existing Teachers Table (Display Section) --- */}
            <div className="mt-10">
                <h3 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">Existing Teachers</h3>

                {tableLoading && <p className="text-indigo-400">Loading teachers...</p>}
                
                {!tableLoading && teachers.length === 0 && (
                    <p className="text-gray-500">No teacher accounts found in the database.</p>
                )}

                {teachers.length > 0 && (
                    <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-xl">
                        <table className="min-w-full text-left text-gray-300">
                            <thead>
                                <tr className="uppercase text-sm bg-gray-700 text-gray-200">
                                    <th className="py-3 px-4">ID</th>
                                    <th className="py-3 px-4">Username</th>
                                    <th className="py-3 px-4">Teacher ID</th>
                                    <th className="py-3 px-4">Department</th>
                                    <th className="py-3 px-4">Role</th>
                                    {/* 🚨 NEW: Action Header */}
                                    <th className="py-3 px-4">Action</th> 
                                </tr>
                            </thead>
                            <tbody>
                                {teachers.map((teacher) => (
                                    // 🚨 PASS THE DELETE HANDLER TO THE ROW COMPONENT
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