export default function Spinner({ label }: { label?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: '64px 0',
      color: 'var(--text-muted)',
      fontSize: 13,
    }}>
      <div style={{
        width: 20,
        height: 20,
        border: '2px solid #e2e8f0',
        borderTopColor: 'var(--brand)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      {label && <span>{label}</span>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
