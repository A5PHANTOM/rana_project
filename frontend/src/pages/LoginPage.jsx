import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../hooks/useAuth.jsx';

function LoginPage() {
    const [formData, setFormData] = useState({ username: '', password: '' });
    const [role, setRole] = useState('Admin'); 
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { login: authLogin } = useAuth(); 

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRoleChange = (e) => {
        setRole(e.target.value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Admin and Teacher both use their respective login endpoints
            const endpoint = role === 'Admin' ? 'auth/token' : 'teacher/login'; 
            
            const result = await login(formData, endpoint);
            
            // 🚨 CRITICAL: authLogin saves the token to localStorage for the services to use
            if (result.access_token) {
                authLogin(result.access_token, role); 
                console.log(`Login Successful! Token stored. Role: ${role}`);
            } else {
                throw new Error("No token received from server");
            }

            // Route based on role
            if (role === 'Admin') {
                navigate('/dashboard', { replace: true });
            } else {
                navigate('/teacher/dashboard', { replace: true });
            }

        } catch (err) {
            setError(err.message || `Login failed. Check credentials and selected role.`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-xl shadow-2xl">
                <h2 className="text-3xl font-extrabold text-white text-center">Monitor System Login</h2>
                
                {error && <div className="p-3 text-sm font-medium text-white bg-red-600 rounded-lg">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Login Role</label>
                        <div className="flex space-x-4">
                            <label className="flex items-center text-gray-300">
                                <input 
                                    type="radio" name="role" value="Admin" 
                                    checked={role === 'Admin'} onChange={handleRoleChange} 
                                    className="text-indigo-500 form-radio"
                                />
                                <span className="ml-2">Admin</span>
                            </label>
                            <label className="flex items-center text-gray-300">
                                <input 
                                    type="radio" name="role" value="Teacher" 
                                    checked={role === 'Teacher'} onChange={handleRoleChange} 
                                    className="text-indigo-500 form-radio"
                                />
                                <span className="ml-2">Teacher</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300">Username</label>
                        <input type="text" name="username" value={formData.username} onChange={handleChange} className="w-full mt-1 p-3 border border-gray-600 rounded-lg bg-gray-700 text-white outline-none" required />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300">Password</label>
                        <input type="password" name="password" value={formData.password} onChange={handleChange} className="w-full mt-1 p-3 border border-gray-600 rounded-lg bg-gray-700 text-white outline-none" required />
                    </div>

                    <button type="submit" className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition ${loading ? 'opacity-50' : ''}`} disabled={loading}>
                        {loading ? 'Logging In...' : `Login as ${role}`}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default LoginPage;