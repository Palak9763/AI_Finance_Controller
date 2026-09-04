import { useEffect, useState, useMemo } from 'react'
import { Search, ChevronLeft, ChevronRight, CheckCircle2, ArrowLeftRight, FileText, Link2, GitCompare, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { endpoints, type ReconciliationResult, type Dashboard } from '../api/client'
import { useToast } from '../components/Toast'

const TABS = [
  { key: 'MATCHED', label: 'Matched', icon: CheckCircle2 },
  { key: 'MISMATCH', label: 'Amount Mismatch', icon: ArrowLeftRight },
  { key: 'MISSING', label: 'Only in GSTR-2B', icon: FileText },
  { key: 'DUPLICATE', label: 'Only in Tally', icon: Link2 }, // using DUPLICATE status as a proxy
  { key: 'DIFFERENCE', label: 'Difference', icon: GitCompare },
]

// Status map lives outside the component — stable reference, never recreated
const TAB_STATUS: Record<string, string[]> = {
  MATCHED:    ['MATCHED'],
  MISMATCH:   ['MISMATCH'],
  MISSING:    ['MISSING'],
  DUPLICATE:  ['DUPLICATE'],
  DIFFERENCE: ['PARTIAL_MATCH', 'AMBIGUOUS', 'REVIEW_REQUIRED'],
}

const fmt = (v: string | number | null | undefined) =>
  v != null ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const fmtCount = (v: number | undefined) => v ?? 0

export default function ReconciliationPage() {
  const [allRows, setAllRows] = useState<ReconciliationResult[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Dashboard | null>(null)
  
  const [tab, setTab]         = useState('MATCHED')
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(0)
  const [pageSize, setPageSize] = useState(10)
  
  const [uploadOpen, setUploadOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploadSource, setUploadSource] = useState('invoices')
  const [uploading, setUploading] = useState(false)
  
  const toast = useToast()
  const nav   = useNavigate()

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    toast(`Uploading ${file.name} as '${uploadSource}'...`, 'info')
    try {
      const res = await endpoints.uploadCsv(file, uploadSource)
      const { rows_inserted, rows_errored, message } = res.data
      if (rows_errored > 0) {
        toast(`${rows_inserted} rows uploaded, ${rows_errored} errors. ${message}`, 'error')
      } else {
        toast(message, 'success')
      }
      setUploadOpen(false)
      setFile(null)
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? 'Upload failed. Check file format.'
      toast(detail, 'error')
    } finally {
      setUploading(false)
    }
  }

  // Single fetch — no tab filter, client-side does all slicing
  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [dashRes, allRes] = await Promise.all([
          endpoints.dashboard(),
          endpoints.results({ limit: 5000 }),
        ])
        setSummary(dashRes.data)
        setAllRows(allRes.data.results)
      } catch {
        toast('Failed to load reconciliation data', 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Client-side tab + search filter
  const filtered = useMemo(() => {
    const statuses = TAB_STATUS[tab] ?? [tab]
    const q = search.trim().toLowerCase()
    return allRows.filter(r => {
      const statusMatch = statuses.includes(r.status ?? '')
      if (!q) return statusMatch
      return statusMatch && (
        r.invoice_no?.toLowerCase().includes(q) ||
        r.vendor?.toLowerCase().includes(q)
      )
    })
  }, [allRows, tab, search])

  const paged     = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))

  const ev = summary?.evaluation
  const counts = ev?.status_breakdown || {}

  // Compute Tally vs GSTR-2B comparison from ALL rows (unfiltered).
  // IMPORTANT: Tally's `tally_amount` is a single gross (tax-inclusive) ledger figure.
  // `gstr2b_amount` is now also stored as gross (taxable + cgst + sgst + igst),
  // pre-computed by main.py before calling reconcile().
  const comparison = useMemo(() => {
    const hasTally  = (r: ReconciliationResult) => r.tally_amount  != null && r.tally_amount  !== ''
    const hasGstr2b = (r: ReconciliationResult) => r.gstr2b_amount != null && r.gstr2b_amount !== ''

    // Populations
    const both    = allRows.filter(r => hasTally(r) && hasGstr2b(r))   // present in both — comparable
    const tallyOnly  = allRows.filter(r => hasTally(r) && !hasGstr2b(r))
    const gstr2bOnly = allRows.filter(r => hasGstr2b(r) && !hasTally(r))

    const sumField = (rows: ReconciliationResult[], key: keyof ReconciliationResult) =>
      rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)

    return {
      // Matched-set counts
      bothCount:       both.length,
      tallyOnlyCount:  tallyOnly.length,
      gstr2bOnlyCount: gstr2bOnly.length,
      // Matched-set amounts (apples-to-apples)
      tallyGross:      sumField(both, 'tally_amount'),
      gstr2bGross:     sumField(both, 'gstr2b_amount'),
      // One-sided amounts
      tallyOnlyAmt:    sumField(tallyOnly, 'tally_amount'),
      gstr2bOnlyAmt:   sumField(gstr2bOnly, 'gstr2b_amount'),
    }
  }, [allRows])

  const COMPARISON_ROWS = [
    {
      label: 'Matched Invoices (both sources)',
      tally: comparison.bothCount,
      gstr2b: comparison.bothCount,
      isCount: true,
      note: null,
    },
    {
      label: 'Total Amount — Gross (matched set)',
      tally: comparison.tallyGross,
      gstr2b: comparison.gstr2bGross,
      isCount: false,
      note: 'Only invoices present in both Tally & GSTR-2B',
    },
    {
      label: 'Only in Tally (invoices)',
      tally: comparison.tallyOnlyCount,
      gstr2b: 0,
      isCount: true,
      note: null,
    },
    {
      label: 'Only in Tally (amount)',
      tally: comparison.tallyOnlyAmt,
      gstr2b: 0,
      isCount: false,
      note: null,
    },
    {
      label: 'Only in GSTR-2B (invoices)',
      tally: 0,
      gstr2b: comparison.gstr2bOnlyCount,
      isCount: true,
      note: null,
    },
    {
      label: 'Only in GSTR-2B (amount)',
      tally: 0,
      gstr2b: comparison.gstr2bOnlyAmt,
      isCount: false,
      note: null,
    },
  ]

  const fmtDiff = (d: number, isCount = false) => {
    if (Math.abs(d) < (isCount ? 0.5 : 0.01)) return { label: '—', color: '#94a3b8' }
    if (isCount) {
      const n = Math.round(d)
      return { label: n > 0 ? `+${n}` : `${n}`, color: n > 0 ? '#16a34a' : '#dc2626' }
    }
    const s = `₹${Math.abs(d).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return { label: d > 0 ? `+${s}` : `-${s}`, color: d > 0 ? '#16a34a' : '#dc2626' }
  }



  // Cards Data based on screenshot exactly
  const CARDS = [
    { key: 'MATCHED',      label: 'MATCHED',      sub: 'ITC claimable',          count: counts['MATCHED'] ?? 0,                color: '#16a34a' },
    { key: 'MISMATCH',     label: 'MISMATCH',     sub: 'Amount differences',     count: counts['MISMATCH'] ?? 0,               color: '#dc2626' },
    { key: 'ONLY_IN_TALLY',label: 'ONLY IN TALLY',sub: 'Not in GSTR-2B',        count: comparison.tallyOnlyCount,             color: '#0f172a' },
    { key: 'ONLY_IN_2B',   label: 'ONLY IN 2B',   sub: 'Not in Tally',          count: comparison.gstr2bOnlyCount,            color: '#ea580c' },
    { key: 'DIFFERENCE',   label: 'DIFFERENCE',   sub: 'Partial / Ambiguous',   count: (counts['PARTIAL_MATCH'] ?? 0) + (counts['AMBIGUOUS'] ?? 0) + (counts['REVIEW_REQUIRED'] ?? 0), color: '#dc2626' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f9fa' }}>
      
      {/* Top Header - Outside standard layout to match screenshot exactly */}
      <div style={{ padding: '20px 32px 0 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <button onClick={() => nav(-1)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>GST Reconciliation</h1>
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>GSTIN: <span style={{ color: '#cbd5e1' }}>—</span></span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>2026-04-01 to 2026-06-30</span>
          </div>
        </div>
        <button 
          onClick={() => setUploadOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <Upload size={14} /> Upload Data
        </button>
      </div>

      <ConfirmDialog
        open={uploadOpen}
        title="Upload Data"
        description="Select a CSV or Excel (.xlsx / .xls) file. Choose the data source type first, then upload."
        confirmLabel={uploading ? 'Uploading...' : 'Upload'}
        onCancel={() => { setUploadOpen(false); setFile(null) }}
        onConfirm={handleUpload}
      >
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Data Source</label>
            <select
              value={uploadSource}
              onChange={(e) => setUploadSource(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#fff' }}
            >
              <option value="invoices">Invoices</option>
              <option value="gstr1">GSTR-1</option>
              <option value="gstr2b">GSTR-2B</option>
              <option value="tally">Tally</option>
              <option value="bank">Bank Statement</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>CSV File</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ width: '100%', padding: '10px', border: '1px dashed #cbd5e1', borderRadius: 6, fontSize: 13 }}
            />
          </div>
          {file && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', borderRadius: 4, padding: '6px 10px' }}>
              📄 {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
        </div>
      </ConfirmDialog>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        
        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
          {CARDS.map((c) => (
            <div key={c.key} style={{
              background: '#fff',
              borderRadius: 8,
              padding: '16px 20px',
              border: c.key === 'MATCHED' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
              boxShadow: c.key === 'MATCHED' ? '0 0 0 1px #2563eb15' : '0 1px 2px rgba(0,0,0,0.05)',
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: c.color, lineHeight: 1, marginBottom: 8 }}>{c.count}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Tally vs GSTR-2B comparison Table */}
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 24 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
            Tally vs GSTR-2B comparison
          </div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600, fontSize: 10, letterSpacing: '0.05em' }}>COMPONENT</th>
                <th style={{ textAlign: 'right', padding: '12px 20px', fontWeight: 600, fontSize: 10, letterSpacing: '0.05em' }}>TALLY</th>
                <th style={{ textAlign: 'right', padding: '12px 20px', fontWeight: 600, fontSize: 10, letterSpacing: '0.05em' }}>DIFFERENCE</th>
                <th style={{ textAlign: 'right', padding: '12px 20px', fontWeight: 600, fontSize: 10, letterSpacing: '0.05em' }}>GSTR-2B</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map(({ label, tally, gstr2b, isCount }, idx, arr) => {
                const diff = fmtDiff(tally - gstr2b, isCount)
                const display = (v: number) => isCount ? String(v) : `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                return (
                  <tr key={label} style={{ borderBottom: idx === arr.length - 1 ? 'none' : '1px dashed #f1f5f9' }}>
                    <td style={{ padding: '14px 20px', color: '#475569' }}>{label}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{display(tally)}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600, color: diff.color }}>{diff.label}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{display(gstr2b)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Section with Tabs and Data Table */}
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
            {TABS.map((t) => {
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setPage(0) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '14px 20px', background: 'none', border: 'none', borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
                    color: active ? '#2563eb' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .1s',
                  }}
                >
                  <t.icon size={14} /> {t.label}
                </button>
              )
            })}
          </div>

          {/* Search bar inside the tab panel */}
          <div style={{ padding: '16px 20px' }}>
            <div style={{ position: 'relative', width: 280 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={() => {}}
                placeholder="Search invoice or vendor..."
                style={{
                  width: '100%', padding: '8px 12px 8px 34px', fontSize: 13,
                  border: '1px solid #e2e8f0', borderRadius: 6, color: '#0f172a',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600, fontSize: 10, letterSpacing: '0.05em' }}>INVOICE</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600, fontSize: 10, letterSpacing: '0.05em' }}>VENDOR</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 600, fontSize: 10, letterSpacing: '0.05em' }}>GSTIN</th>
                  <th style={{ textAlign: 'right', padding: '12px 20px', fontWeight: 600, fontSize: 10, letterSpacing: '0.05em' }}>TAXABLE</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 40 }}><Spinner /></td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: 13 }}>
                        No matched invoices
                      </div>
                    </td>
                  </tr>
                ) : paged.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 20px', fontWeight: 600, color: '#0f172a' }}>{r.invoice_no}</td>
                    <td style={{ padding: '14px 20px', color: '#475569' }}>{r.vendor}</td>
                    <td style={{ padding: '14px 20px', color: '#64748b', fontSize: 11, fontFamily: 'monospace' }}>{r.gstin || '—'}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', color: '#0f172a' }}>{fmt(r.invoices_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 12
          }}>
            <div>{paged.length === 0 ? 'No entries found' : `Showing ${page * pageSize + 1} to ${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length} entries`}</div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Pagination controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 4, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {page + 1}
                </button>
                <button
                  disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }}
                  style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4, outline: 'none', color: '#475569', fontSize: 12 }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
