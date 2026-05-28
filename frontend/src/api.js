import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Add a request interceptor to attach the session token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('vault_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add a response interceptor to handle 401s globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login if session expired
      localStorage.removeItem('vault_token');
      window.dispatchEvent(new Event('session-expired'));
    }
    return Promise.reject(error);
  }
);

export default api;
