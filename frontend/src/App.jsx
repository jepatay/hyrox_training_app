import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui/toast';
import Layout from '@/components/Layout';
import Unauthorized from '@/pages/Unauthorized';
import Home from '@/pages/Home';
import LogSession from '@/pages/LogSession';
import Dashboard from '@/pages/Dashboard';
import Objectives from '@/pages/Objectives';
import TrainingLog from '@/pages/TrainingLog';
import Records from '@/pages/Records';
import StravaCallback from '@/pages/StravaCallback';
import KnowledgeLibrary from '@/pages/KnowledgeLibrary';
import Drafts from '@/pages/Drafts';
import ExerciseLibrary from '@/pages/ExerciseLibrary';
import StationReferences from '@/pages/StationReferences';

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
        <Route path="/" element={<Home />} />
        <Route path="/log" element={<LogSession />} />
        <Route path="/objectives" element={<Objectives />} />
        <Route path="/drafts" element={<Drafts />} />
        <Route path="/records" element={<Records />} />
        <Route path="/strava/callback" element={<StravaCallback />} />
        <Route path="/knowledge" element={<KnowledgeLibrary />} />
        <Route path="/exercise-library" element={<ExerciseLibrary />} />
        <Route path="/station-references" element={<StationReferences />} />

        {/* Change Brief V2 Phase 5: Home (+ the training log list on it) replaces
            this page's spot in the menu, but nothing here is deleted — kept
            reachable directly for full session edit/delete until a dedicated
            replacement exists. Not linked from the sidebar. */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/training" element={<TrainingLog />} />
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
