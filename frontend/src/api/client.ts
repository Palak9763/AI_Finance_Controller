import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

export interface EvaluationMetrics {
  total_records: number
  matched: number
  matched_with_tolerance: number
  partial: number
  mismatch: number
  missing: number
  duplicate: number
  ambiguous: number
  review_required: number
  resolved_records: number
  exception_records: number
  match_rate: number
  resolution_rate: number
  exception_rate: number
  accuracy_against_ground_truth: number
  ground_truth_compared: number
  processing_time_ms: number
  throughput_records_per_second: number
  confusion_matrix: Record<string, Record<string, number>>
  status_breakdown: Record<string, number>
}

export interface Dashboard {
  has_run: boolean
  run_id?: number
  run_at?: string
  evaluation?: EvaluationMetrics
  exception_count?: number
  anomaly_count?: number
  pending_reviews?: number
  approved_reviews?: number
  rejected_reviews?: number
  investigations_done?: number
}

export interface ReconciliationResult {
  id: number
  invoice_no: string
  vendor: string
  gstin: string
  date: string
  invoices_amount: string | null
  gstr1_amount: string | null
  gstr2b_amount: string | null
  tally_amount: string | null
  bank_amount: string | null
  status: string
  match_level: number | null
  absolute_difference: string | null
  percentage_difference: string | null
  evidence: string[]
  ai_insight: string | null
}

export interface ExceptionItem {
  id: number
  result_id: number
  invoice_no: string
  vendor: string
  status: string
  severity: string
  created_at: string
  investigation_status: string
}

export interface EvidenceItem {
  source: string
  field: string
  value: any
  type: 'FOUND_EVIDENCE' | 'INFERENCE' | 'UNKNOWN'
}

export interface Investigation {
  id: number
  exception_id: number
  case_id: string
  provider: string
  status: string
  stages: { stage: string; detail: string }[]
  summary: string
  root_cause: string
  evidence: EvidenceItem[]
  recommendation: string
  confidence: number
  risk_level: string
  requires_human_review: boolean
  retrieved_docs: string[]
  created_at: string
}

export interface Review {
  id: number
  exception_id: number
  investigation_id: number | null
  status: string
  created_at: string
  decided_at: string | null
  reason: string | null
  invoice_no?: string
  vendor?: string
  status_reconciliation?: string
  recommendation?: string
  confidence?: number
  risk_level?: string
  provider?: string
}

export interface AuditLogEntry {
  id: number
  timestamp: string
  actor: string
  action: string
  entity_type: string
  entity_id: string
  previous_status: string | null
  new_status: string | null
  ai_recommendation: string | null
  human_decision: string | null
  reason: string | null
  metadata: any
}

export interface Anomaly {
  id: number
  invoice_no: string
  vendor: string
  amount: number
  expected_range_low: number
  expected_range_high: number
  anomaly_score: number
  reason: string
  risk_level: string
  reconciliation_status: string
}

export const endpoints = {
  health: () => axios.get('/health'),
  runReconciliation: () => api.post('/reconciliation/run'),
  dashboard: () => api.get<Dashboard>('/dashboard'),
  evaluation: () => api.get<Dashboard>('/evaluation'),
  results: (params?: any) => api.get<{ results: ReconciliationResult[]; total: number }>('/reconciliation/results', { params }),
  result: (id: number) => api.get<ReconciliationResult>(`/reconciliation/results/${id}`),
  exceptions: (params?: any) => api.get<{ exceptions: ExceptionItem[]; total: number }>('/exceptions', { params }),
  exception: (id: number) => api.get(`/exceptions/${id}`),
  investigate: (id: number, provider?: string) => api.post(`/exceptions/${id}/investigate`, { provider }),
  investigation: (id: number) => api.get<Investigation>(`/investigations/${id}`),
  anomalies: (params?: any) => api.get<{ anomalies: Anomaly[]; total: number }>('/anomalies', { params }),
  reviews: (params?: any) => api.get<{ reviews: Review[]; total: number }>('/reviews', { params }),
  approve: (id: number, body?: any) => api.post(`/reviews/${id}/approve`, body),
  reject: (id: number, body?: any) => api.post(`/reviews/${id}/reject`, body),
  pending: (id: number, body?: any) => api.post(`/reviews/${id}/pending`, body),
  auditLogs: (params?: any) => api.get<{ audit_logs: AuditLogEntry[] }>('/audit-logs', { params }),
  knowledgeDocs: () => api.get('/knowledge-documents'),
  invoices: (params?: any) => api.get('/transactions/invoices', { params }),
}
