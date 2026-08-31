import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

interface Toast { id: number; message: string; kind: 'success' | 'error' | 'info' }
const ToastCtx = createContext<(msg: string, kind?: Toast['kind']) => void>(() => {})

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: 320,
      }}>
        {toasts.map((t) => {
          const style = t.kind === 'success' ? { border: '#bbf7d0', bg: '#f0fdf4', text: '#16a34a', icon: CheckCircle2 }
            : t.kind === 'error' ? { border: '#fecaca', bg: '#fef2f2', text: '#dc2626', icon: XCircle }
            : { border: '#bfdbfe', bg: '#eff6ff', text: '#2563eb', icon: Info }
          const Icon = style.icon
          
          return (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow)',
                background: 'var(--surface)',
                border: `1px solid ${style.border}`,
                borderLeft: `4px solid ${style.text}`,
                fontSize: 13,
                animation: 'slideIn 0.2s ease-out forwards',
              }}
            >
              <Icon size={16} color={style.text} style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-primary)', flex: 1, fontWeight: 500, lineHeight: 1.4 }}>
                {t.message}
              </span>
              <button
                onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ToastCtx.Provider>
  )
}
