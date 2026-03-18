import { createContext, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const tokenFromUrl = searchParams.get('access');
    const storedToken = sessionStorage.getItem('access_token');

    if (tokenFromUrl) {
      sessionStorage.setItem('access_token', tokenFromUrl);
      setIsAuthorized(true);
      // Remove token from URL for cleanliness
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('access');
      setSearchParams(newParams, { replace: true });
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
