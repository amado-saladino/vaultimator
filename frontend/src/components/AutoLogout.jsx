import { useEffect, useRef } from 'react';

const DEFAULT_TIMEOUT_MINUTES = 15;

export default function AutoLogout({ children, onLogout }) {
  const timerRef = useRef(null);

  const resetTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    const storedTimeout = localStorage.getItem('vault_timeout_minutes');
    const timeoutMinutes = storedTimeout ? parseInt(storedTimeout, 10) : DEFAULT_TIMEOUT_MINUTES;
    
    timerRef.current = setTimeout(() => {
      if (localStorage.getItem('vault_token')) {
        onLogout();
      }
    }, timeoutMinutes * 60 * 1000);
  };

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll'];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    const handleSessionExpired = () => {
      onLogout();
    };
    window.addEventListener('session-expired', handleSessionExpired);

    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('session-expired', handleSessionExpired);
    };
  }, [onLogout]);

  return <>{children}</>;
}
