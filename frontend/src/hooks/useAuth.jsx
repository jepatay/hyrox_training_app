import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('access');
    const storedToken = sessionStorage.getItem('access_token');

    if (tokenFromUrl) {
      sessionStorage.setItem('access_token', tokenFromUrl);
      setIsAuthorized(true);
      // Remove token from URL for cleanliness
      params.delete('access');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
      window.history.replaceState(null, '', newUrl);
    } else if (storedToken) {
      setIsAuthorized(true);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthorized(false);
    };
    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthorized, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
