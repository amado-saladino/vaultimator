import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import api from './api';
import AutoLogout from './components/AutoLogout';
import { ToastProvider } from './components/Toast';

// Pages
import SetupPage from './pages/SetupPage';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';

function AppRoutes() {
  const [initialized, setInitialized] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('vault_token'));
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/status')
      .then((res) => {
        setInitialized(res.data.initialized);
      })
      .catch((err) => {
        console.error("Failed to fetch vault status", err);
      })
      .finally(() => {
        setLoading(false);
      });

    // Listen for session-expired events
    const handleSessionExpired = () => {
      setIsLoggedIn(false);
    };
    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, []);

  const handleSetupComplete = () => {
    setInitialized(true);
    navigate('/login', { replace: true });
  };

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    navigate('/dashboard', { replace: true });
  };

  const handleLogout = () => {
    localStorage.removeItem('vault_token');
    setIsLoggedIn(false);
    navigate('/login', { replace: true });
  };

  if (loading) {
    return <div className="centered-page">Loading Vaultimator...</div>;
  }

  return (
    <AutoLogout onLogout={handleLogout}>
      <Routes>
        {!initialized ? (
          <>
            <Route path="/setup" element={<SetupPage onSetupComplete={handleSetupComplete} />} />
            <Route path="*" element={<Navigate to="/setup" replace />} />
          </>
        ) : (
          <>
            <Route path="/login" element={
              isLoggedIn ? <Navigate to="/dashboard" replace /> : <LoginPage onLoginSuccess={handleLoginSuccess} />
            } />
            <Route 
              path="/dashboard/*" 
              element={
                isLoggedIn ? <Dashboard onLogout={handleLogout} /> : <Navigate to="/login" replace />
              } 
            />
            <Route path="*" element={<Navigate to={isLoggedIn ? "/dashboard" : "/login"} replace />} />
          </>
        )}
      </Routes>
    </AutoLogout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
