import { useEffect, useState } from 'react'
import { Receipt } from 'lucide-react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { endpoints } from '../api/client'

const STATUS_COLOR: Record<string, string> = {
  PAID: '#16a34a', UNPAID: '#dc2626', PARTIAL: '#d97706',
}

export default function TransactionsPage() {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    ;(async () => {
      try {
        const res = await endpoints.invoices({ limit: 200 })
        setRows(res.data.invoices)
      } catch {
        toast('Failed to load transactions', 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const fmtINR = (v: any) => v != null ? `₹${Number(v).toLocaleString('en-IN')}` : '—'

  return (
    <Layout title="Transactions" breadcrumb="Data">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, marginTop: -8 }}>
        Raw source invoice records ingested from the synthetic batch.
      </p>
      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState
          icon={<Receipt size={36} />}
          title="No invoices ingested yet"
          description="Run reconciliation from the Dashboard to ingest the synthetic batch."
        />
      ) : (
        <div className="table-wrapper">
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>Vendor</th>
                  <th>GSTIN</th>
                  <th>Date</th>
                  <th className="right">Taxable Value</th>
                  <th className="right">Tax</th>
                  <th className="right">Total</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="primary">{r.invoice_no}</td>
                    <td>{r.vendor}</td>
                    <td className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.gstin}</td>
                    <td>{r.date}</td>
                    <td className="right">{fmtINR(r.taxable_value)}</td>
                    <td className="right">{fmtINR(r.tax)}</td>
                    <td className="right primary">{fmtINR(r.total)}</td>
                    <td>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: STATUS_COLOR[r.payment_status] || 'var(--text-muted)',
                        background: STATUS_COLOR[r.payment_status] ? `${STATUS_COLOR[r.payment_status]}18` : 'var(--bg)',
                        padding: '2px 8px',
                        borderRadius: 20,
                      }}>
                        {r.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-muted)' }}>
            {rows.length} invoice{rows.length !== 1 ? 's' : ''} total
          </div>
        </div>
      )}
    </Layout>
  )
}
