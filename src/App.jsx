import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Objectives from './pages/Objectives'
import TrainingLog from './pages/TrainingLog'
import PerformanceRecords from './pages/PerformanceRecords'
import TrainingSuggestion from './pages/TrainingSuggestion'
import MonthlyReport from './pages/MonthlyReport'
import Unauthorized from './pages/Unauthorized'

function AppRoutes() {
  const { authorized } = useAuth()

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm uppercase tracking-widest">Loading…</span>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return <Unauthorized />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/objectives" element={<Objectives />} />
        <Route path="/training" element={<TrainingLog />} />
        <Route path="/records" element={<PerformanceRecords />} />
        <Route path="/suggest" element={<TrainingSuggestion />} />
        <Route path="/report" element={<MonthlyReport />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
