import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, GitCompareArrows, Search, AlertTriangle, ClipboardCheck,
  ScrollText, BookOpen, Receipt, Settings as SettingsIcon, Zap, LogOut,
  ChevronRight,
} from 'lucide-react'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/reconciliation', label: 'GST Recon', icon: GitCompareArrows },
  { to: '/investigations', label: 'Investigation Workspace', icon: Search },
  { to: '/anomalies', label: 'Anomalies', icon: AlertTriangle },
  { to: '/reviews', label: 'Human Reviews', icon: ClipboardCheck },
  { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { to: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

const NAV_GROUPS = [
  { label: 'Main', items: NAV.slice(0, 2) },
  { label: 'Workspace', items: NAV.slice(2, 6) },
  { label: 'Data', items: NAV.slice(6) },
]

export default function Layout({
  children,
  title,
  breadcrumb,
}: {
  children: ReactNode
  title: string
  breadcrumb?: string
}) {
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 'var(--sidebar-w)',
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 16px',
          height: 'var(--header-h)',
          borderBottom: '1px solid var(--border-light)',
        }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Zap size={14} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              FinanceAI
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.2 }}>
              Reconciliation Copilot
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          {NAV_GROUPS.map((grp) => (
            <div key={grp.label} style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '.05em',
                padding: '0 8px',
                marginBottom: 4,
              }}>
                {grp.label}
              </div>
              {grp.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 8px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
                    background: isActive ? 'var(--brand-light)' : 'transparent',
                    textDecoration: 'none',
                    marginBottom: 1,
                    transition: 'all .12s',
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #e0e7ff, #f0fdf4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--brand)',
            flexShrink: 0,
          }}>
            A
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Admin User
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>SQLite • Demo Mode</div>
          </div>
          <LogOut size={14} color="var(--text-muted)" style={{ flexShrink: 0, cursor: 'pointer' }} />
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflow: 'hidden' }}>
        {/* Top bar */}
        <header style={{
          height: 'var(--header-h)',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          flexShrink: 0,
          gap: 6,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Home</span>
          <ChevronRight size={12} color="var(--text-muted)" />
          {breadcrumb && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{breadcrumb}</span>
              <ChevronRight size={12} color="var(--text-muted)" />
            </>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20, lineHeight: 1.2 }}>
            {title}
          </h1>
          {children}
        </main>
      </div>
    </div>
  )
}
