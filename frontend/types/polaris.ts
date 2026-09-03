// ── Polaris-specific types (STAR/DEX forms, manual findings, overall history) ──

// ─── STAR Audit Form ──────────────────────────────────────────────────────────
export interface StarAuditFormData {
  client_name: string
  project_name: string
  project_manager: string
  estimated_sow_signed_date?: string
  project_start_date?: string
  project_end_date?: string
  project_duration_months?: string
  project_duration_weeks?: string
  estimated_budget: string
  estimated_project_margin?: string
  discount_provided?: 'Yes' | 'No' | ''
  discount_percentage?: string
  discount_approver_email?: string
  project_details?: string
  // Files handled separately as FormData
}

// ─── DEX Audit Form ───────────────────────────────────────────────────────────
export interface DexAuditFormData {
  client_name: string
  project_name: string
  project_code: string
  project_manager: string
  sow_signed_date: string
  phase?: string
  project_start_date?: string
  project_end_date?: string
  actual_project_start_date: string
  estimated_project_end_date: string
  project_duration_months?: string
  project_duration_weeks?: string
  estimated_budget: string
  consumed_budget?: string
  current_project_margin?: string
  sharepoint_link: string
  project_details?: string
}

// ─── Audit form detail (returned by GET /polaris/audit/{id}/details) ──────────
export interface AuditFormDetail {
  session_id: string
  audit_type: 'STAR' | 'DEX' | string
  ai_audit_status: string         // not_started | queued | ... | done | failed
  ai_audit_score?: number | null
  ai_audit_report_url?: string | null
  submitted_at: string
  submitted_by?: string | null

  // project
  project_name: string
  client_name: string
  project_code?: string | null
  project_manager?: string | null
  sow_signed_date?: string | null
  project_start_date?: string | null
  project_end_date?: string | null
  actual_project_start_date?: string | null
  estimated_project_end_date?: string | null
  project_duration_months?: string | null
  project_duration_weeks?: string | null
  estimated_budget?: string | null
  estimated_project_margin?: string | null
  consumed_budget?: string | null
  current_project_margin?: string | null
  discount_provided?: string | null
  discount_percentage?: string | null
  discount_approver_email?: string | null
  phase?: string | null
  sharepoint_link?: string | null
  project_details?: string | null

  // documents
  documents: AuditDocumentRef[]

  // manual findings (if any)
  findings?: ManualAuditFinding | null

  // overall audit status
  overall_status: 'pending' | 'under_review' | 'completed' | 'failed'
}

export interface AuditDocumentRef {
  document_id: string
  file_name: string
  sharepoint_url?: string | null
  mime_type?: string | null
  status: string
}

// ─── Manual auditor findings ─────────────────────────────────────────────────
export interface ScoreEntry {
  sub_category: string
  manual_score: number        // 0–5
  ai_score?: number | null
  remarks?: string
}

export interface FindingCategory {
  category: string
  scores: ScoreEntry[]
  remarks?: string
}

export interface ManualAuditFinding {
  finding_id?: string
  session_id: string
  auditor_name?: string
  auditor_email?: string
  auditor_comments?: string
  overall_score?: number      // 0–5 computed from categories
  categories: FindingCategory[]
  submitted_at?: string
}

// ─── Start-audit queue row ────────────────────────────────────────────────────
export interface AuditQueueRow {
  session_id: string
  client_name: string
  project_name: string
  project_code?: string | null
  docs_submitted: number
  audit_initiation_date: string
  audit_type: string
  project_start_date?: string | null
  ai_audit_status: string
  overall_status: string
}

// ─── Overall audit history row ────────────────────────────────────────────────
export interface OverallAuditHistoryRow {
  session_id: string
  client_name: string
  project_name: string
  project_code?: string | null
  audit_type: string
  submitted_at: string
  submitted_by?: string | null
  ai_audit_status: string
  ai_audit_score?: number | null
  manual_score?: number | null
  overall_status: string
  has_report: boolean
}
