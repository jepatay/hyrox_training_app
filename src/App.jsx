import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import EventEditor from './pages/EventEditor';
import StartList from './pages/StartList';
import Results from './pages/Results';
import Settings from './pages/Settings';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) {
    return <div className="loading-screen"><span>Loading...</span></div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) {
    return <div className="loading-screen"><span>Loading...</span></div>;
  }
  if (user) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/event/new" element={<ProtectedRoute><EventEditor /></ProtectedRoute>} />
      <Route path="/event/:id" element={<ProtectedRoute><EventEditor /></ProtectedRoute>} />
      <Route path="/event/:id/startlist" element={<ProtectedRoute><StartList /></ProtectedRoute>} />
      <Route path="/event/:id/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
