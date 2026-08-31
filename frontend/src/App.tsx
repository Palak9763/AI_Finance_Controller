import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import DashboardPage from './pages/DashboardPage'
import ReconciliationPage from './pages/ReconciliationPage'
import InvestigationWorkspace from './pages/InvestigationWorkspace'
import AnomaliesPage from './pages/AnomaliesPage'
import ReviewsPage from './pages/ReviewsPage'
import AuditLogsPage from './pages/AuditLogsPage'
import KnowledgeBasePage from './pages/KnowledgeBasePage'
import TransactionsPage from './pages/TransactionsPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/reconciliation" element={<ReconciliationPage />} />
          <Route path="/investigations" element={<InvestigationWorkspace />} />
          <Route path="/anomalies" element={<AnomaliesPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
