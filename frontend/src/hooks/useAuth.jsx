// monitor-web/src/hooks/useAuth.js

import React, { createContext, useContext, useState, useEffect } from 'react';

// 1. Create Context
const AuthContext = createContext(null);

// -----------------------------------------------------------
// 2. The Hook (useAuth)
// -----------------------------------------------------------
// 🚨 Named Export for the Hook
export const useAuth = () => {
    return useContext(AuthContext);
};

// -----------------------------------------------------------
// 3. The Provider Component (AuthProvider)
// -----------------------------------------------------------
// 🚨 Named Export for the Provider Component
export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    // 🚨 NEW: State for User Role, initialized from localStorage
    const [userRole, setUserRole] = useState(localStorage.getItem('user_role') || null); 
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem('access_token');
        const storedRole = localStorage.getItem('user_role'); // 🚨 Get role on load
        
        if (storedToken && storedRole) {
            setToken(storedToken);
            setIsAuthenticated(true);
            setUserRole(storedRole); // Set role on load
        }
        setIsLoading(false); 
    }, []);

    // Function to update state and storage after successful login
    const login = (accessToken, role) => {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('user_role', role);
        setToken(accessToken);
        setIsAuthenticated(true);
        setUserRole(role); // Set role on login
    };

    // Function to clear state and storage for logout
    const logout = () => {
        localStorage.clear();
        setToken(null);
        setIsAuthenticated(false);
        setUserRole(null); // Clear role on logout
        // The App.jsx ProtectedRoute handles navigation after state change
    };

    const value = { token, isAuthenticated, isLoading, userRole, login, logout };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};