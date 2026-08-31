import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  PlayCircle, Database, TrendingUp, CheckSquare, AlertOctagon,
  ShieldCheck, Loader2, Clock, BarChart2,
} from 'lucide-react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { endpoints, type Dashboard as DashboardType } from '../api/client'
import { useToast } from '../components/Toast'

const STATUS_COLORS: Record<string, string> = {
  MATCHED: '#16a34a',
  MATCHED_WITH_TOLERANCE: '#22c55e',
  PARTIAL_MATCH: '#f59e0b',
  MISMATCH: '#ef4444',
  MISSING: '#fb923c',
  DUPLICATE: '#8b5cf6',
  AMBIGUOUS: '#64748b',
  REVIEW_REQUIRED: '#0ea5e9',
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  light,
}: {
  icon: any
  label: string
  value: string | number
  sub?: string
  color: string
  light: string
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      boxShadow: 'var(--shadow-sm)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {label}
        </span>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: light,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon size={15} color={color} strokeWidth={2} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {sub}
          </div>
        )}
      </div>
      {/* colored bottom accent */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: color,
        opacity: .18,
        borderRadius: '0 0 var(--radius) var(--radius)',
      }} />
    </div>
  )
}

const customTooltipStyle = {
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  color: 'var(--text-primary)',
  boxShadow: 'var(--shadow)',
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardType | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const res = await endpoints.dashboard()
      setData(res.data)
    } catch {
      toast('Failed to load dashboard', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const runPipeline = async () => {
    setRunning(true)
    try {
      const res = await endpoints.runReconciliation()
      toast(`Reconciliation complete — ${res.data.evaluation.total_records} records processed`, 'success')
      await load()
    } catch {
      toast('Reconciliation run failed', 'error')
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <Layout title="Dashboard"><Spinner label="Loading dashboard…" /></Layout>

  const ev = data?.evaluation
  const chartData = ev
    ? Object.entries(ev.status_breakdown).map(([status, count]) => ({
        status: status.replace(/_/g, ' '),
        count,
        key: status,
      }))
    : []

  return (
    <Layout title="Dashboard" breadcrumb="Overview">
      {/* Run button row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20, marginTop: -8 }}>
        <button
          id="run-reconciliation-btn"
          onClick={runPipeline}
          disabled={running}
          className="btn-primary"
          style={{ padding: '9px 18px', fontSize: 13 }}
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
          {running ? 'Running…' : 'Run Reconciliation'}
        </button>
      </div>

      {!data?.has_run ? (
        <EmptyState
          icon={<Database size={40} />}
          title="No reconciliation run yet"
          description="Click 'Run Reconciliation' to process the synthetic batch and populate every metric from a real computation."
          action={
            <button
              onClick={runPipeline}
              disabled={running}
              className="btn-primary"
            >
              <PlayCircle size={15} /> {running ? 'Running…' : 'Run Reconciliation'}
            </button>
          }
        />
      ) : (
        <>
          {/* Top KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
            <StatCard icon={Database} label="Total Records" value={ev!.total_records}
              sub={`Run #${data.run_id}`} color="#2563eb" light="#eff6ff" />
            <StatCard icon={TrendingUp} label="Match Rate" value={`${ev!.match_rate}%`}
              sub={`${ev!.matched + ev!.matched_with_tolerance} matched`} color="#16a34a" light="#f0fdf4" />
            <StatCard icon={CheckSquare} label="Resolution Rate" value={`${ev!.resolution_rate}%`}
              sub={`${ev!.resolved_records} resolved`} color="#0ea5e9" light="#f0f9ff" />
            <StatCard icon={ShieldCheck} label="Ground Truth Accuracy" value={`${ev!.accuracy_against_ground_truth}%`}
              sub={`${ev!.ground_truth_compared} compared`} color="#7c3aed" light="#f5f3ff" />
          </div>

          {/* Second KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
            <StatCard icon={AlertOctagon} label="Open Exceptions" value={data.exception_count!}
              sub={`${ev!.exception_rate}% exception rate`} color="#dc2626" light="#fef2f2" />
            <StatCard icon={AlertOctagon} label="Anomalies Flagged" value={data.anomaly_count!}
              color="#f59e0b" light="#fffbeb" />
            <StatCard icon={Clock} label="Pending Reviews" value={data.pending_reviews!}
              color="#64748b" light="#f8fafc" />
            <StatCard icon={BarChart2} label="Throughput"
              value={`${ev!.throughput_records_per_second.toLocaleString()}/s`}
              sub={`${ev!.processing_time_ms} ms total`} color="#0d9488" light="#f0fdfa" />
          </div>

          {/* Chart */}
          <div className="card" style={{ padding: '20px 20px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
              Status Breakdown
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>
                live from current run
              </span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f3f8" />
                <XAxis
                  dataKey="status"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={customTooltipStyle}
                  cursor={{ fill: '#f8f9fc' }}
                />
                <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={48}>
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || '#2563eb'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Layout>
  )
}
