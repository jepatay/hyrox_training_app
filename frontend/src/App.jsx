import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui/toast';
import Layout from '@/components/Layout';
import Unauthorized from '@/pages/Unauthorized';
import Dashboard from '@/pages/Dashboard';
import Objectives from '@/pages/Objectives';
import TrainingLog from '@/pages/TrainingLog';
import Records from '@/pages/Records';
import MonthlyReport from '@/pages/MonthlyReport';
import SuggestionTool from '@/pages/SuggestionTool';
import Venues from '@/pages/Venues';
import StravaCallback from '@/pages/StravaCallback';
import KnowledgeLibrary from '@/pages/KnowledgeLibrary';
import Drafts from '@/pages/Drafts';

function AppContent() {
  const { isAuthorized, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <Unauthorized />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/objectives" element={<Objectives />} />
        <Route path="/training" element={<TrainingLog />} />
        <Route path="/drafts" element={<Drafts />} />
        <Route path="/records" element={<Records />} />
        <Route path="/report" element={<MonthlyReport />} />
        <Route path="/suggest" element={<SuggestionTool />} />
        <Route path="/venues" element={<Venues />} />
        <Route path="/strava/callback" element={<StravaCallback />} />
        <Route path="/knowledge" element={<KnowledgeLibrary />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
