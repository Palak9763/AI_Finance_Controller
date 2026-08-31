import { useEffect, useState } from 'react'
import { ServerCog, Database, Bot, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import { endpoints } from '../api/client'

function InfoCard({ icon: Icon, iconColor, title, children }: any) {
  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${iconColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={iconColor} />
        </div>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const [health, setHealth] = useState<'ok' | 'down' | 'checking'>('checking')

  useEffect(() => {
    endpoints.health()
      .then(() => setHealth('ok'))
      .catch(() => setHealth('down'))
  }, [])

  return (
    <Layout title="Settings" breadcrumb="Configuration">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 760 }}>
        <InfoCard icon={ServerCog} iconColor="#2563eb" title="Backend API">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Health Status</span>
              {health === 'checking'
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 12 }}><Loader2 size={12} className="animate-spin" /> Checking…</span>
                : health === 'ok'
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontWeight: 600, fontSize: 12 }}><CheckCircle2 size={12} /> Online</span>
                : <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', fontWeight: 600, fontSize: 12 }}><XCircle size={12} /> Offline</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>API Base</span>
              <code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                /api
              </code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Framework</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>FastAPI + Uvicorn</span>
            </div>
          </div>
        </InfoCard>

        <InfoCard icon={Database} iconColor="#0d9488" title="Data Layer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Database</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>SQLite (file-based)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>ORM</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>SQLAlchemy</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>External Services</span>
              <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 12 }}>None required</span>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6, borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
            Set <code style={{ fontSize: 11, background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>DATABASE_URL</code> to switch to Postgres/Supabase.
          </p>
        </InfoCard>

        <InfoCard icon={Bot} iconColor="#7c3aed" title="AI Provider">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Active Provider</span>
              <span style={{ background: '#f5f3ff', color: '#7c3aed', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                Demo AI Provider
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>External API Calls</span>
              <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 12 }}>None (demo mode)</span>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6, borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
            Set <code style={{ fontSize: 11, background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>OPENAI_API_KEY</code> to enable real OpenAI Agent with GPT-4o. Demo provider is always the fallback.
          </p>
        </InfoCard>

        <InfoCard icon={ServerCog} iconColor="#f59e0b" title="Environment">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            {[
              { k: 'DATABASE_URL', note: 'optional (defaults to SQLite)' },
              { k: 'OPENAI_API_KEY', note: 'optional (enables real AI)' },
            ].map((env) => (
              <div key={env.k}>
                <code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-primary)', display: 'block', marginBottom: 2 }}>
                  {env.k}
                </code>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{env.note}</span>
              </div>
            ))}
          </div>
        </InfoCard>
      </div>
    </Layout>
  )
}
