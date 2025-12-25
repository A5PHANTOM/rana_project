// monitor-web/src/api/auth.js

// 🚨 FIX: Base URL now points to the API root. The full endpoint path is passed by the caller.
const API_ROOT_URL = "http://127.0.0.1:8000/api"; 

/**
 * Handles login for both Admin and Teacher roles.
 * * @param {object} formData - Object containing {username, password} from the form.
 * @param {string} endpoint - The specific API route (e.g., 'auth/token', 'teacher/login').
 */
export async function login(formData, endpoint) {
  
  // FastAPI uses the standard OAuth2PasswordRequestForm, requiring 
  // the data to be sent as 'x-www-form-urlencoded' data.
  
  // 🚨 FIX: The entire formData object is used here to build the body
  const formBody = Object.keys(formData)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(formData[key]))
    .join('&');
    
  try {
    // 🚨 FIX: Use the dynamic endpoint to construct the URL
    const response = await fetch(`${API_ROOT_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    });

    if (!response.ok) {
      const errorData = await response.json();
      // Throw the detailed message from FastAPI
      throw new Error(errorData.detail || `Login failed with status: ${response.status}`);
    }

    const data = await response.json();
    // The data contains the access_token, user_id, role, etc.
    return data; 

  } catch (error) {
    console.error("Login API Error:", error);
    // Re-throw to be caught by the calling component (LoginPage)
    throw error;
  }
}