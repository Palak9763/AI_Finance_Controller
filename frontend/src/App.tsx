import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import ReconciliationPage from './pages/ReconciliationPage'
import InvestigationWorkspace from './pages/InvestigationWorkspace'
import AnomaliesPage from './pages/AnomaliesPage'
import ReviewsPage from './pages/ReviewsPage'
import AuditLogsPage from './pages/AuditLogsPage'
import KnowledgeBasePage from './pages/KnowledgeBasePage'
import TransactionsPage from './pages/TransactionsPage'
import SettingsPage from './pages/SettingsPage'

/** Redirects unauthenticated users to /login */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
    }}>
      <div style={{ color: '#fff', fontSize: 15, opacity: 0.7 }}>Loading…</div>
    </div>
  )
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

/** Redirects already-logged-in users away from login/register */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to="/" replace /> : <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

            {/* Protected */}
            <Route path="/"               element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
            <Route path="/reconciliation" element={<PrivateRoute><ReconciliationPage /></PrivateRoute>} />
            <Route path="/investigations" element={<PrivateRoute><InvestigationWorkspace /></PrivateRoute>} />
            <Route path="/anomalies"      element={<PrivateRoute><AnomaliesPage /></PrivateRoute>} />
            <Route path="/reviews"        element={<PrivateRoute><ReviewsPage /></PrivateRoute>} />
            <Route path="/audit-logs"     element={<PrivateRoute><AuditLogsPage /></PrivateRoute>} />
            <Route path="/knowledge-base" element={<PrivateRoute><KnowledgeBasePage /></PrivateRoute>} />
            <Route path="/transactions"   element={<PrivateRoute><TransactionsPage /></PrivateRoute>} />
            <Route path="/settings"       element={<PrivateRoute><SettingsPage /></PrivateRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
