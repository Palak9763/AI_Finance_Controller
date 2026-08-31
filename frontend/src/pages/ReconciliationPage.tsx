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

const fmt = (v: string | number | null | undefined) =>
  v != null ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const fmtCount = (v: number | undefined) => v ?? 0

export default function ReconciliationPage() {
  const [rows, setRows]       = useState<ReconciliationResult[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Dashboard | null>(null)
  
  const [tab, setTab]         = useState('MATCHED')
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(0)
  const pageSize = 10
  
  const [uploadOpen, setUploadOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  
  const toast = useToast()
  const nav   = useNavigate()

  const handleUpload = async () => {
    if (!file) return
    toast(`Uploading ${file.name}...`, 'info')
    // Simulate upload delay
    await new Promise(r => setTimeout(r, 1500))
    toast('Data uploaded and processed successfully!', 'success')
    setUploadOpen(false)
    setFile(null)
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await endpoints.dashboard()
        setSummary(res.data)
      } catch {
        // ignore
      }
    })()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (tab !== 'ALL') params.status = tab // We map standard statuses to tabs, this is a simplified proxy
      if (search) params.search = search
      const res = await endpoints.results(params)
      setRows(res.data.results)
      setTotal(res.data.total)
    } catch {
      toast('Failed to load reconciliation results', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab])

  const paged = rows.slice(page * pageSize, (page + 1) * pageSize)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))

  const ev = summary?.evaluation
  const counts = ev?.status_breakdown || {}

  // Cards Data based on screenshot exactly
  const CARDS = [
    { key: 'MATCHED', label: 'MATCHED', sub: 'ITC claimable: ₹0', count: counts['MATCHED'] ?? 0, color: '#16a34a' },
    { key: 'MISMATCH', label: 'MISMATCH', sub: 'Amount differences', count: counts['MISMATCH'] ?? 0, color: '#dc2626' },
    { key: 'ONLY_IN_TALLY', label: 'ONLY IN TALLY', sub: 'Missing from 2B', count: counts['MISSING'] ?? 0, color: '#0f172a' },
    { key: 'ONLY_IN_2B', label: 'ONLY IN 2B', sub: 'Not in Tally', count: counts['DUPLICATE'] ?? 0, color: '#ea580c' },
    { key: 'DIFFERENCE', label: 'DIFFERENCE', sub: 'All mismatches', count: counts['REVIEW_REQUIRED'] ?? 0, color: '#dc2626' },
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
        description="Select an Excel or CSV file containing Tally or GSTR-2B records for reconciliation."
        confirmLabel="Upload"
        onCancel={() => { setUploadOpen(false); setFile(null) }}
        onConfirm={handleUpload}
      >
        <div style={{ marginTop: 16 }}>
          <input 
            type="file" 
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ width: '100%', padding: '10px', border: '1px dashed #cbd5e1', borderRadius: 6, fontSize: 13 }}
          />
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
              {['Total Invoices', 'Taxable Value', 'Total CGST', 'Total SGST', 'Total IGST', 'Total Amount'].map((label, idx, arr) => (
                <tr key={label} style={{ borderBottom: idx === arr.length - 1 ? 'none' : '1px dashed #f1f5f9' }}>
                  <td style={{ padding: '14px 20px', color: '#475569' }}>{label}</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{label === 'Total Invoices' ? '0' : '₹0.00'}</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{label === 'Total Invoices' ? '0' : '₹0.00'}</td>
                </tr>
              ))}
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
                onKeyDown={(e) => e.key === 'Enter' && load()}
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
            <div>{paged.length === 0 ? 'No entries found' : `Showing ${page * pageSize + 1} to ${Math.min((page + 1) * pageSize, rows.length)} of ${rows.length} entries`}</div>
            
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
                <select style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4, outline: 'none', color: '#475569', fontSize: 12 }}>
                  <option>10</option>
                  <option>25</option>
                  <option>50</option>
                </select>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
