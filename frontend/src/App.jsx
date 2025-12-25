import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// 🚨 Import AuthProvider and useAuth to manage state centrally
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';

// Import Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TeacherDashboardPage from './pages/TeacherDashboardPage'; // 🚨 NEW: Teacher Dashboard Page

// --- Protected Route Wrapper (Role-Based Access Control) ---
const ProtectedRoute = ({ children, allowedRole }) => {
    // 🚨 FIX: Use useAuth hook for consistent state management
    const { isAuthenticated, userRole } = useAuth();
    
    // 1. Check if the user is logged in
    if (!isAuthenticated) {
        return <Navigate to="/" replace />;
    }
    
    // 2. Check if the authenticated user has the correct role
    if (allowedRole && userRole !== allowedRole) {
        // Redirect if the role doesn't match the required role
        // For simplicity, we redirect back to login, or you could add a 403 page.
        return <Navigate to="/" replace />; 
    }
    
    return children;
};


function App() {
    return (
        <Router>
            <AuthProvider>
                <Routes>
                    {/* 1. Login Route: Accessible by everyone */}
                    <Route path="/" element={<LoginPage />} />

                    {/* 2. Admin Routes: Requires 'Admin' role */}
                    <Route 
                        path="/dashboard/*" 
                        element={
                            <ProtectedRoute allowedRole="Admin">
                                <DashboardPage />
                            </ProtectedRoute>
                        } 
                    />
                    
                    {/* 🚨 3. Teacher Routes: Requires 'Teacher' role */}
                    <Route 
                        path="/teacher/dashboard" 
                        element={
                            <ProtectedRoute allowedRole="Teacher">
                                <TeacherDashboardPage />
                            </ProtectedRoute>
                        } 
                    />
                    
                    {/* 4. Fallback: Redirect any unknown path back to the login page */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AuthProvider>
        </Router>
    );
}

export default App;