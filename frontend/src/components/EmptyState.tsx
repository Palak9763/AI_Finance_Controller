import type { ReactNode } from 'react'

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '64px 24px',
      border: '1.5px dashed var(--border)',
      borderRadius: 'var(--radius)',
      background: 'var(--surface)',
    }}>
      {icon && (
        <div style={{ color: '#cbd5e1', marginBottom: 12 }}>
          {icon}
        </div>
      )}
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, maxWidth: 380, lineHeight: 1.6 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}
