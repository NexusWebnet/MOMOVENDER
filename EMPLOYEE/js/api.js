// public/js/api.js — Universal API Fetch with Cookie Support

// Global fetch wrapper — use this for ALL authenticated API calls
const apiFetch = async (url, options = {}) => {
  const defaultOptions = {
    credentials: 'include', // Automatically send/receive cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, defaultOptions);

    // Handle non-JSON responses (e.g., 404 HTML page)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response:', text);
      throw new Error('Server returned invalid response');
    }

    const data = await response.json();

    // Handle errors from backend
    if (!response.ok || !data.success) {
      throw new Error(data.message || `HTTP error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

// Logout function (clears cookie via backend)
const logout = async () => {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    localStorage.clear(); // Clear user data
    window.location.href = '/login.html';
  } catch (err) {
    console.error('Logout failed:', err);
    alert('Logout failed. Please try again.');
  }
};

// Export for use in other scripts
export { apiFetch, logout };