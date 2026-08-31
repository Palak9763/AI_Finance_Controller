import { useEffect, useState } from 'react'
import { AlertTriangle, TrendingDown } from 'lucide-react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import StatusBadge from '../components/StatusBadge'
import { endpoints, type Anomaly } from '../api/client'
import { useToast } from '../components/Toast'

const RISK_COLORS: Record<string, string> = {
  HIGH: '#dc2626', MEDIUM: '#d97706', LOW: '#16a34a',
}

export default function AnomaliesPage() {
  const [rows, setRows]       = useState<Anomaly[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('')
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const res = await endpoints.anomalies(filter ? { risk_level: filter } : undefined)
      setRows(res.data.anomalies)
    } catch {
      toast('Failed to load anomalies', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const fmtINR = (n: number) => `₹${n.toLocaleString('en-IN')}`

  return (
    <Layout title="Anomalies" breadcrumb="Workspace">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, marginTop: -8, maxWidth: 640 }}>
        Statistical outlier detection (z-score + IQR per vendor) runs independently of reconciliation — a
        transaction can be fully Matched and still flagged here.
      </p>

      {/* Risk filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[{ k: '', l: 'All Risk Levels' }, { k: 'HIGH', l: 'High' }, { k: 'MEDIUM', l: 'Medium' }, { k: 'LOW', l: 'Low' }].map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`pill${filter === f.k ? ' active' : ''}`}
          >
            {f.k && (
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: RISK_COLORS[f.k],
                display: 'inline-block',
              }} />
            )}
            {f.l}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={36} />}
          title="No anomalies flagged"
          description="Run reconciliation from the Dashboard first, or fewer than 4 transactions exist per vendor."
        />
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Vendor</th>
                <th className="right">Amount</th>
                <th className="right">Expected Range</th>
                <th className="right">Score</th>
                <th>Risk Level</th>
                <th>Recon. Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="primary">{a.invoice_no}</td>
                  <td>{a.vendor}</td>
                  <td className="right primary">
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <TrendingDown size={12} color="#dc2626" />
                      {fmtINR(a.amount)}
                    </span>
                  </td>
                  <td className="right" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {fmtINR(a.expected_range_low)} – {fmtINR(a.expected_range_high)}
                  </td>
                  <td className="right" style={{ fontWeight: 600, color: RISK_COLORS[a.risk_level] || 'var(--text-secondary)' }}>
                    {a.anomaly_score}
                  </td>
                  <td><StatusBadge status={a.risk_level} /></td>
                  <td><StatusBadge status={a.reconciliation_status} /></td>
                  <td style={{ maxWidth: 280, fontSize: 12, color: 'var(--text-muted)' }}>{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-muted)' }}>
            {rows.length} anomal{rows.length !== 1 ? 'ies' : 'y'} detected
          </div>
        </div>
      )}
    </Layout>
  )
}
