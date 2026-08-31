import { useEffect, useState } from 'react'
import { ScrollText, User, Bot, Activity } from 'lucide-react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { endpoints, type AuditLogEntry } from '../api/client'
import { useToast } from '../components/Toast'

const ACTOR_COLORS: Record<string, { color: string; bg: string; icon: any }> = {
  system:   { color: '#2563eb', bg: '#eff6ff', icon: Activity },
  ai_agent: { color: '#7c3aed', bg: '#f5f3ff', icon: Bot },
}

function ActorChip({ actor }: { actor: string }) {
  const cfg = ACTOR_COLORS[actor] || { color: '#64748b', bg: '#f8fafc', icon: User }
  const Icon = cfg.icon
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 20,
      color: cfg.color,
      background: cfg.bg,
    }}>
      <Icon size={10} /> {actor}
    </span>
  )
}

export default function AuditLogsPage() {
  const [rows, setRows]       = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('')
  const toast = useToast()

  const load = async (entityType?: string) => {
    setLoading(true)
    try {
      const res = await endpoints.auditLogs(entityType ? { entity_type: entityType } : undefined)
      setRows(res.data.audit_logs)
    } catch {
      toast('Failed to load audit logs', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(filter || undefined) }, [filter])

  const FILTERS = ['', 'reconciliation_run', 'exception', 'review']

  return (
    <Layout title="Audit Logs" breadcrumb="Workspace">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, marginTop: -8, maxWidth: 640 }}>
        Every reconciliation run, AI investigation, and human decision is logged here — the immutable record
        of what happened and who decided it.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`pill${filter === f ? ' active' : ''}`}>
            {f || 'All Events'}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={<ScrollText size={36} />} title="No audit entries yet" description="Run reconciliation to generate the first entry." />
      ) : (
        <div className="card">
          {rows.map((a, idx) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                padding: '14px 20px',
                borderBottom: idx < rows.length - 1 ? '1px solid var(--border-light)' : 'none',
              }}
            >
              {/* Timeline dot */}
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: a.actor === 'ai_agent' ? '#7c3aed' : a.actor === 'system' ? '#2563eb' : '#64748b',
                flexShrink: 0,
                marginTop: 6,
              }} />

              {/* Timestamp */}
              <div style={{ width: 130, flexShrink: 0, fontSize: 11, color: 'var(--text-muted)', paddingTop: 2 }}>
                {new Date(a.timestamp).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {a.action.replace(/_/g, ' ')}
                  </span>
                  <ActorChip actor={a.actor} />
                  <span style={{
                    fontSize: 11,
                    background: 'var(--bg)',
                    color: 'var(--text-muted)',
                    padding: '1px 7px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                  }}>
                    {a.entity_type} #{a.entity_id}
                  </span>
                </div>

                {(a.previous_status || a.new_status) && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {a.previous_status && (
                      <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
                        {a.previous_status}
                      </span>
                    )}
                    {a.previous_status && a.new_status && <span>→</span>}
                    {a.new_status && (
                      <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                        {a.new_status}
                      </span>
                    )}
                  </div>
                )}
                {a.ai_recommendation && (
                  <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 3 }}>
                    🤖 AI: {a.ai_recommendation}
                  </div>
                )}
                {a.reason && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Reason: "{a.reason}"
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
