const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  MATCHED:                { label: 'Matched',              color: '#16a34a', bg: '#f0fdf4' },
  MATCHED_WITH_TOLERANCE: { label: 'Matched ~',            color: '#15803d', bg: '#dcfce7' },
  PARTIAL_MATCH:          { label: 'Partial',              color: '#d97706', bg: '#fef9c3' },
  MISMATCH:               { label: 'Mismatch',             color: '#dc2626', bg: '#fef2f2' },
  MISSING:                { label: 'Missing',              color: '#ea580c', bg: '#fff7ed' },
  DUPLICATE:              { label: 'Duplicate',            color: '#7c3aed', bg: '#f5f3ff' },
  AMBIGUOUS:              { label: 'Ambiguous',            color: '#64748b', bg: '#f8fafc' },
  REVIEW_REQUIRED:        { label: 'Review Required',      color: '#0369a1', bg: '#eff6ff' },
  HIGH:                   { label: 'High',                 color: '#dc2626', bg: '#fef2f2' },
  MEDIUM:                 { label: 'Medium',               color: '#d97706', bg: '#fffbeb' },
  LOW:                    { label: 'Low',                  color: '#16a34a', bg: '#f0fdf4' },
  PENDING:                { label: 'Pending',              color: '#0369a1', bg: '#eff6ff' },
  APPROVED:               { label: 'Approved',             color: '#16a34a', bg: '#f0fdf4' },
  REJECTED:               { label: 'Rejected',             color: '#dc2626', bg: '#fef2f2' },
  DONE:                   { label: 'Done',                 color: '#16a34a', bg: '#f0fdf4' },
}

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: '#64748b', bg: '#f8fafc' }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 20,
      color: s.color,
      background: s.bg,
      border: `1px solid ${s.color}22`,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}
