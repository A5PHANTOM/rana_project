const API_BASE_URL = "http://127.0.0.1:8000/api";

/**
 * Utility to construct the Authorization header.
 *
 */
const getAuthHeaders = (token) => { 
    if (!token) {
        // This catch prevents the "No token found" warning from appearing silently.
        throw new Error("Authentication token required for protected endpoint.");
    }
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };
};

/**
 * Core Fetch Wrapper for Admin Endpoints.
 * Handles token attachment and FastAPI error parsing.
 */
const fetchData = async (endpoint, token, options = {}) => {
    let headers;
    try {
        headers = getAuthHeaders(token);
    } catch (authError) {
        throw authError;
    }

    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
        ...options,
        headers: {
            ...headers,
            ...options.headers,
        },
    });

    if (!response.ok) {
        const status = response.status;
        let detail = `Request failed with status ${status}.`; 
        
        try {
            const errorData = await response.json();
            detail = errorData.detail || detail;
        } catch (e) {
            // Keep default message if response is not JSON
        }
        
        throw new Error(detail); 
    }
    
    return response.json();
};

// ----------------------------------------------------------------------
// 📋 Classroom Management Endpoints
// ----------------------------------------------------------------------

/**
 * Fetches the list of all classes (used for the Monitor Grid and Table).
 *
 */
export async function getAllClassesData(token) {
    return fetchData('admin/classes/all', token, { method: 'GET' });
}

/**
 * Creates a new class and saves the camera IP.
 *
 */
export async function createClass(data, token) {
    return fetchData('admin/classes', token, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * Deletes a class by ID.
 *
 */
export async function deleteClass(classId, token) {
    return fetchData(`admin/classes/${classId}`, token, { method: 'DELETE' });
}

// ----------------------------------------------------------------------
// 👤 User (Teacher) Management Endpoints
// ----------------------------------------------------------------------

/**
 * Fetches the list of all teacher users.
 *
 */
export async function getAllTeachers(token) {
    return fetchData('admin/teachers', token, { method: 'GET' });
}

/**
 * Submits new teacher account data.
 *
 */
export async function createTeacher(data, token) {
    return fetchData('admin/create_teacher', token, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * Assigns a teacher to a specific classroom.
 *
 */
export async function assignTeacherToClass(data, token) {
    return fetchData('admin/assign_class', token, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * Deletes a teacher user by ID.
 *
 */
export async function deleteTeacher(teacherId, token) {
    return fetchData(`admin/teachers/${teacherId}`, token, { method: 'DELETE' });
}

// ----------------------------------------------------------------------
// 📊 Audit Log Endpoints
// ----------------------------------------------------------------------

/**
 * Fetches all violation logs including screenshots.
 *
 */
export async function getAuditLogs(token) {
    return fetchData('admin/audit_logs', token, { method: 'GET' });
}