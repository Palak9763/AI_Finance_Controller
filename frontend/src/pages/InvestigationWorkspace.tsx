import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Sparkles, CheckCircle2, XCircle, Clock, Loader2, FileSearch, BookOpen, Gauge,
} from 'lucide-react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import StatusBadge from '../components/StatusBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { endpoints, type ExceptionItem, type AIConfig } from '../api/client'
import { useToast } from '../components/Toast'

const EVIDENCE_STYLES: Record<string, { color: string; bg: string }> = {
  FOUND_EVIDENCE: { color: '#16a34a', bg: '#f0fdf4' },
  INFERENCE:      { color: '#0369a1', bg: '#eff6ff' },
  UNKNOWN:        { color: '#64748b', bg: '#f8fafc' },
}

function SourceCell({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {value ? `₹${Number(value).toLocaleString('en-IN')}` : 'Not found'}
      </div>
    </div>
  )
}

export default function InvestigationWorkspace() {
  const [params]          = useSearchParams()
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId]   = useState<number | null>(null)
  const [detail, setDetail]           = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [investigating, setInvestigating] = useState(false)
  const [visibleStages, setVisibleStages] = useState(0)
  const [confirmAction, setConfirmAction] = useState<'APPROVED' | 'REJECTED' | null>(null)
  const [reason, setReason] = useState('')
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)
  const toast = useToast()

  const loadList = async () => {
    setLoadingList(true)
    try {
      const res = await endpoints.exceptions()
      setExceptions(res.data.exceptions)
      const preselect = params.get('result')
      if (preselect && res.data.exceptions.some((e) => e.result_id === Number(preselect))) {
        setSelectedId(res.data.exceptions.find((e) => e.result_id === Number(preselect))!.id)
      } else if (res.data.exceptions.length && selectedId === null) {
        setSelectedId(res.data.exceptions[0].id)
      }
    } catch {
      toast('Failed to load exception queue', 'error')
    } finally {
      setLoadingList(false)
    }
  }

  const loadDetail = async (id: number) => {
    setLoadingDetail(true)
    setDetail(null)
    try {
      const res = await endpoints.exception(id)
      setDetail(res.data)
    } catch {
      toast('Failed to load exception detail', 'error')
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => { loadList() }, [])
  useEffect(() => { if (selectedId !== null) loadDetail(selectedId) }, [selectedId])
  useEffect(() => {
    endpoints.config().then(r => setAiConfig(r.data)).catch(() => {})
  }, [])

  const runInvestigation = async () => {
    if (selectedId === null) return
    setInvestigating(true)
    setVisibleStages(0)
    try {
      const res = await endpoints.investigate(selectedId)
      const stages = res.data.investigation.stages || []
      for (let i = 0; i < stages.length; i++) {
        await new Promise((r) => setTimeout(r, 280))
        setVisibleStages(i + 1)
      }
      await loadDetail(selectedId)
      await loadList()
      toast('Investigation complete.', 'success')
    } catch {
      toast('Investigation failed', 'error')
    } finally {
      setInvestigating(false)
    }
  }

  const decide = async (status: 'APPROVED' | 'REJECTED') => {
    if (!detail?.review) return
    try {
      if (status === 'APPROVED') await endpoints.approve(detail.review.id, { reason })
      else await endpoints.reject(detail.review.id, { reason })
      toast(`Review ${status.toLowerCase()}.`, 'success')
      setConfirmAction(null)
      setReason('')
      await loadDetail(selectedId!)
      await loadList()
    } catch {
      toast('Failed to record decision', 'error')
    }
  }

  const AGENT_STAGES = [
    'Understand Exception', 'Collect Related Records', 'Search Finance Knowledge (RAG)',
    'Analyze Evidence', 'Identify Root Cause', 'Generate Recommendation', 'Confidence Check', 'Queue Human Review',
  ]

  const r = detail?.result

  return (
    <Layout title="Investigation Workspace" breadcrumb="Workspace">
      {/* AI Provider status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>AI Engine:</span>
        {aiConfig ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 20,
            background: aiConfig.ai_provider_active ? '#f0fdf4' : '#f8fafc',
            color: aiConfig.ai_provider_active ? '#16a34a' : '#64748b',
            border: `1px solid ${aiConfig.ai_provider_active ? '#bbf7d0' : '#e2e8f0'}`,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: aiConfig.ai_provider_active ? '#16a34a' : '#94a3b8', display: 'inline-block' }} />
            {aiConfig.ai_provider}
            {aiConfig.model && <span style={{ fontWeight: 400, color: '#16a34a' }}>({aiConfig.model})</span>}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Checking…</span>
        )}
        {aiConfig && !aiConfig.ai_provider_active && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            — add <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>OPENAI_API_KEY</code> to <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>backend/.env</code> to enable real AI
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, height: 'calc(100vh - 140px)' }}>

        {/* ── Exception Queue ── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-light)',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '.05em',
          }}>
            Exception Queue ({exceptions.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingList ? <Spinner /> : exceptions.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                No exceptions. Run reconciliation first.
              </div>
            ) : exceptions.map((e) => (
              <button
                key={e.id}
                id={`exception-item-${e.id}`}
                onClick={() => setSelectedId(e.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-light)',
                  background: selectedId === e.id ? 'var(--brand-light)' : 'transparent',
                  border: 'none',
                  borderLeft: selectedId === e.id ? `3px solid var(--brand)` : '3px solid transparent',
                  cursor: 'pointer',
                  transition: 'all .12s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.invoice_no}
                  </span>
                  {e.investigation_status === 'DONE'
                    ? <CheckCircle2 size={13} color="#16a34a" style={{ flexShrink: 0 }} />
                    : <Clock size={13} color="#94a3b8" style={{ flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.vendor}
                </div>
                <div style={{ marginTop: 6 }}>
                  <StatusBadge status={e.status} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Detail Panel ── */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loadingDetail ? <Spinner label="Loading case…" /> : !detail ? (
            <EmptyState icon={<FileSearch size={36} />} title="Select an exception" description="Choose a case from the queue on the left to begin investigating." />
          ) : (
            <>
              {/* Header card */}
              <div className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{detail.invoice_no}</h2>
                      <StatusBadge status={detail.status} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                        Severity: <strong style={{ color: 'var(--text-primary)' }}>{detail.severity}</strong>
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{detail.vendor}</p>
                    {r?.evidence?.length > 0 && (
                      <ul style={{ marginTop: 8, paddingLeft: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                        {r.evidence.map((ev: string, i: number) => <li key={i}>{ev}</li>)}
                      </ul>
                    )}
                  </div>
                  {!detail.investigation && (
                    <button
                      id="investigate-btn"
                      onClick={runInvestigation}
                      disabled={investigating}
                      className="btn-primary"
                      style={{ flexShrink: 0 }}
                    >
                      {investigating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {investigating
                        ? 'Investigating…'
                        : aiConfig?.ai_provider_active
                        ? `Investigate with ${aiConfig.model ?? 'OpenAI'}`
                        : 'Investigate with AI'}
                    </button>
                  )}
                </div>
              </div>

              {/* Agent stages */}
              {investigating && (
                <div className="card" style={{ padding: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 12 }}>
                    AI Agent Progress
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {AGENT_STAGES.map((s, i) => (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: i > visibleStages ? .3 : 1, transition: 'opacity .3s' }}>
                        {i < visibleStages
                          ? <CheckCircle2 size={14} color="#16a34a" />
                          : i === visibleStages
                          ? <Loader2 size={14} color="#2563eb" className="animate-spin" />
                          : <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #d1d9e6' }} />}
                        <span style={{ fontSize: 13, color: i <= visibleStages ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: i < visibleStages ? 500 : 400 }}>
                          {s}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source comparison */}
              {r && (
                <div className="card" style={{ padding: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Source Comparison
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    <SourceCell label="Invoice" value={r.invoices_amount} />
                    <SourceCell label="GSTR-1 / 2B" value={r.gstr1_amount || r.gstr2b_amount} />
                    <SourceCell label="Tally" value={r.tally_amount} />
                    <SourceCell label="Bank" value={r.bank_amount} />
                  </div>
                  {r.absolute_difference && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fff7ed', borderRadius: 8, border: '1px solid #fed7aa', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ color: '#ea580c', fontWeight: 700 }}>Δ Difference:</span>
                      <span style={{ color: '#c2410c', fontWeight: 700 }}>₹{Number(r.absolute_difference).toLocaleString('en-IN')}</span>
                      {r.percentage_difference && <span style={{ color: '#ea580c' }}>({r.percentage_difference}%)</span>}
                    </div>
                  )}
                </div>
              )}

              {/* AI Investigation result */}
              {detail.investigation && !investigating && (
                <div className="card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>
                      AI Investigation
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                      background: '#f5f3ff', color: '#7c3aed', border: '1px solid #e9d5ff',
                    }}>
                      {detail.investigation.provider}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Root Cause</div>
                      <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{detail.investigation.root_cause}</p>
                    </div>
                    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Recommendation</div>
                      <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{detail.investigation.recommendation}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <Gauge size={14} color="var(--text-muted)" />
                      <span style={{ color: 'var(--text-muted)' }}>Confidence:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{Math.round(detail.investigation.confidence * 100)}%</strong>
                    </div>
                    <StatusBadge status={detail.investigation.risk_level} />
                    {detail.investigation.requires_human_review && (
                      <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600, background: '#fffbeb', padding: '2px 8px', borderRadius: 20, border: '1px solid #fde68a' }}>
                        ⚠ Requires Human Review
                      </span>
                    )}
                  </div>

                  {/* Retrieved docs */}
                  {detail.investigation.retrieved_docs?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <BookOpen size={11} /> Policy Documents Cited
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {detail.investigation.retrieved_docs.map((d: string) => (
                          <span key={d} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                            📄 {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evidence */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Evidence</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {detail.investigation.evidence.map((ev: any, i: number) => {
                        const style = EVIDENCE_STYLES[ev.type] || EVIDENCE_STYLES.UNKNOWN
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 12, color: style.color, background: style.bg }}>
                              {ev.type}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>{ev.source}.{ev.field}</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{String(ev.value)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Review controls */}
                  {detail.review && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                        Review status: <StatusBadge status={detail.review.status} />
                      </div>
                      {detail.review.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            id="approve-case-btn"
                            onClick={() => setConfirmAction('APPROVED')}
                            className="btn-primary"
                            style={{ background: '#16a34a' }}
                          >
                            <CheckCircle2 size={14} /> Approve
                          </button>
                          <button
                            id="reject-case-btn"
                            onClick={() => setConfirmAction('REJECTED')}
                            className="btn-primary"
                            style={{ background: '#dc2626' }}
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Decided {detail.review.decided_at ? new Date(detail.review.decided_at).toLocaleString() : ''}
                          {detail.review.reason && ` — "${detail.review.reason}"`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === 'APPROVED' ? 'Approve this case?' : 'Reject this case?'}
        description="This writes a permanent audit log entry with your decision and reason."
        confirmLabel={confirmAction === 'APPROVED' ? 'Approve' : 'Reject'}
        danger={confirmAction === 'REJECTED'}
        onCancel={() => { setConfirmAction(null); setReason('') }}
        onConfirm={() => confirmAction && decide(confirmAction)}
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional but recommended)…"
          className="input"
          style={{ marginTop: 10, resize: 'vertical' }}
          rows={2}
        />
      </ConfirmDialog>
    </Layout>
  )
}
