import { type ReactNode } from 'react'
import { X } from 'lucide-react'

export default function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirm', danger, onConfirm, onCancel, children,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,23,42,.4)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,.15)',
        width: '100%',
        maxWidth: 440,
        padding: '24px 24px 20px',
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={16} />
          </button>
        </div>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{description}</p>
        )}
        {children && <div style={{ marginTop: 12 }}>{children}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn-primary"
            style={{ background: danger ? '#dc2626' : 'var(--brand)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
