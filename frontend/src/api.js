import axios from 'axios';
import { getFieldKey, encryptField, decryptField } from './crypto';

const api = axios.create({
  baseURL: '/api',
});

// Add a request interceptor to attach the session token and encrypt payload
api.interceptors.request.use(
  async (config) => {
    const token = localStorage.getItem('vault_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Encrypt sensitive vault data fields on PUT /data
    if (config.method === 'put' && config.url === '/data' && config.data) {
      const cryptoKey = getFieldKey();
      if (cryptoKey) {
        // Create a deep copy to avoid mutating the React state
        const data = JSON.parse(JSON.stringify(config.data));
        
        if (data.passwords) {
          for (let p of data.passwords) {
            p.password = await encryptField(cryptoKey, p.password);
            p.note = await encryptField(cryptoKey, p.note);
          }
        }
        
        if (data.secret_notes) {
          for (let n of data.secret_notes) {
            n.note = await encryptField(cryptoKey, n.note);
          }
        }
        
        config.data = data;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Add a response interceptor to handle 401s globally and decrypt payload
api.interceptors.response.use(
  async (response) => {
    // Decrypt sensitive vault data fields on GET /data
    if (response.config.method === 'get' && response.config.url === '/data' && response.data) {
      const cryptoKey = getFieldKey();
      if (cryptoKey) {
        let migrated = false;
        
        if (response.data.passwords) {
          for (let p of response.data.passwords) {
            if (p.password && !p.password.startsWith('v1:')) migrated = true;
            if (p.note && !p.note.startsWith('v1:')) migrated = true;
            
            p.password = await decryptField(cryptoKey, p.password);
            p.note = await decryptField(cryptoKey, p.note);
          }
        }
        
        if (response.data.secret_notes) {
          for (let n of response.data.secret_notes) {
            if (n.note && !n.note.startsWith('v1:')) migrated = true;
            
            n.note = await decryptField(cryptoKey, n.note);
          }
        }
        
        if (migrated) {
          response.data._needsMigration = true;
        }
      }
    }
    
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    if (error.response && error.response.status === 401 && !originalRequest._retry && originalRequest.url !== '/token') {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('vault_refresh_token');
      
      if (refreshToken) {
        try {
          const res = await axios.post('/api/token', {
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          });
          
          localStorage.setItem('vault_token', res.data.access_token);
          localStorage.setItem('vault_refresh_token', res.data.refresh_token);
          
          // Update the failed request with the new token
          originalRequest.headers['Authorization'] = `Bearer ${res.data.access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed
        }
      }

      // Clear tokens and redirect to login if session expired completely
      localStorage.removeItem('vault_token');
      localStorage.removeItem('vault_refresh_token');
      window.dispatchEvent(new Event('session-expired'));
    }
    return Promise.reject(error);
  }
);

export default api;
