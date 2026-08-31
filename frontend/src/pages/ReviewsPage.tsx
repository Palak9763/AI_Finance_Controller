import { useEffect, useState } from 'react'
import { ClipboardCheck, CheckCircle2, XCircle, Clock } from 'lucide-react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import StatusBadge from '../components/StatusBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { endpoints, type Review } from '../api/client'
import { useToast } from '../components/Toast'

export default function ReviewsPage() {
  const [rows, setRows]       = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('PENDING')
  const [confirm, setConfirm] = useState<{ id: number; action: 'APPROVED' | 'REJECTED' } | null>(null)
  const [reason, setReason]   = useState('')
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const res = await endpoints.reviews(filter ? { status: filter } : undefined)
      setRows(res.data.reviews)
    } catch {
      toast('Failed to load reviews', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const decide = async () => {
    if (!confirm) return
    try {
      if (confirm.action === 'APPROVED') await endpoints.approve(confirm.id, { reason })
      else await endpoints.reject(confirm.id, { reason })
      toast(`Review ${confirm.action.toLowerCase()}.`, 'success')
      setConfirm(null); setReason('')
      load()
    } catch {
      toast('Failed to record decision', 'error')
    }
  }

  const FILTERS = [
    { k: 'PENDING',  l: 'Pending',  icon: <Clock size={11} /> },
    { k: 'APPROVED', l: 'Approved', icon: <CheckCircle2 size={11} /> },
    { k: 'REJECTED', l: 'Rejected', icon: <XCircle size={11} /> },
    { k: '',         l: 'All',      icon: null },
  ]

  return (
    <Layout title="Human Reviews" breadcrumb="Workspace">
      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`pill${filter === f.k ? ' active' : ''}`}
          >
            {f.icon} {f.l}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={36} />}
          title="No reviews to show"
          description="Investigate an exception in the Investigation Workspace to create a review."
        />
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Vendor</th>
                <th>Recon. Status</th>
                <th>AI Recommendation</th>
                <th>Confidence</th>
                <th>Risk</th>
                <th>Provider</th>
                <th>Review Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rv) => (
                <tr key={rv.id}>
                  <td className="primary">{rv.invoice_no}</td>
                  <td>{rv.vendor}</td>
                  <td>{rv.status_reconciliation && <StatusBadge status={rv.status_reconciliation} />}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-muted)' }}>
                    {rv.recommendation || '—'}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {rv.confidence != null ? `${Math.round(rv.confidence * 100)}%` : '—'}
                  </td>
                  <td>{rv.risk_level ? <StatusBadge status={rv.risk_level} /> : '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rv.provider || '—'}</td>
                  <td><StatusBadge status={rv.status} /></td>
                  <td>
                    {rv.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          id={`approve-review-${rv.id}`}
                          onClick={() => setConfirm({ id: rv.id, action: 'APPROVED' })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 6,
                            background: '#f0fdf4', color: '#16a34a',
                            border: '1px solid #bbf7d0',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          }}
                          title="Approve"
                        >
                          <CheckCircle2 size={12} /> Approve
                        </button>
                        <button
                          id={`reject-review-${rv.id}`}
                          onClick={() => setConfirm({ id: rv.id, action: 'REJECTED' })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 6,
                            background: '#fef2f2', color: '#dc2626',
                            border: '1px solid #fecaca',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          }}
                          title="Reject"
                        >
                          <XCircle size={12} /> Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {rv.decided_at ? new Date(rv.decided_at).toLocaleDateString() : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-muted)' }}>
            {rows.length} review{rows.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.action === 'APPROVED' ? 'Approve this review?' : 'Reject this review?'}
        description="This writes a permanent audit log entry."
        confirmLabel={confirm?.action === 'APPROVED' ? 'Approve' : 'Reject'}
        danger={confirm?.action === 'REJECTED'}
        onCancel={() => { setConfirm(null); setReason('') }}
        onConfirm={decide}
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)…"
          className="input"
          style={{ marginTop: 10, resize: 'vertical' }}
          rows={2}
        />
      </ConfirmDialog>
    </Layout>
  )
}
