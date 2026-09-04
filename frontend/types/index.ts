// ─── Backend-matching status types ───────────────────────────────────────────
// export type AuditStatus =
//   | 'pending' | 'fetching' | 'identifying' | 'parsing'
//   | 'auditing' | 'summarising' | 'exporting' | 'uploading'
//   | 'done' | 'failed' | 'running' | 'completed' | 'cancelled'

export type AuditStatus =
  | 'pending'
  | 'fetching'
  | 'project_loaded'
  | 'identifying'
  | 'validation_required'
  | 'identified'
  | 'parsing'
  | 'parsed'
  | 'auditing'
  | 'audited'
  | 'summarising'
  | 'summarised'
  | 'exporting'
  | 'uploading'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'error'

export type WSMessageStage =
  | AuditStatus
  | 'document_update'
  | 'documents_validated'
  | 'heartbeat'

export type DocumentStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type StepStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped'
export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug'
export type ChatMessageType =
  | 'status' | 'info' | 'success' | 'error' | 'warning'
  | 'confirm' | 'summary' | 'progress' | 'loading'

// ─── Backend API response shapes ──────────────────────────────────────────────
export interface BackendUser {
  user_id:     string
  user_name:   string
  azure_email: string | null
  role:        'admin' | 'auditor' | 'user'
  created_at:  string
}

export interface IdentifiedDoc {
  filename: string
  matched_category: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

export interface DocumentCorrection {
  filename: string
  new_matched_category: string
}

export interface BackendSession {
  session_id: string
  audit_type: string | null
  sharepoint_item_id: string | null
  audit_status: AuditStatus
  completion_time: string | null
  error_message: string | null

  project?: {
    project_name: string
    client_name: string
    project_code: string
  } | null

  // Flat fields returned by GET /audit/sessions
  project_name?: string
  client_name?: string
  project_code?: string

  // Fields returned by the session list endpoint
  document_count?: number
  overall_project_score?: number | null

  documents?: Array<{
    document_id: string
    file_name: string
    framework_category: string | null
    status?: string
    stage?: string
    started_at?: string | null
    completed_at?: string | null
    error?: string | null
  }>

  audit_results?: Array<{
    audit_id: string
    document_id: string
    score: string
    full_results: AuditCriterion[]
  }>

  // Returned by GET /audit/sessions/{session_id}
  summary?: {
    overall_project_score: number
    executive_summary: string
    cross_document_findings: string[]
    gaps_and_risks: string[]
    strengths: string[]
    recommendation: string[]
  } | null

  report?: {
    report_id: string
    sharepoint_url: string
    report_name: string
    drive_item_id?: string | null
  } | null
}

export interface AuditCriterion {
  criterion?: string
  finding: string
  evidence: string
  recommendation: string
  score?: number
}

// WebSocket message from backend
// Payload shape inside document_update messages
export interface DocumentUpdateData {
  document_id: string
  filename: string
  status: 'queued' | 'parsed' | 'auditing' | 'completed' | 'failed'
  stage?: string
  progress?: number
}

// WebSocket message from backend
export interface WSStageMessage {
  stage: WSMessageStage
  data?: Record<string, unknown>
  identified_docs?: IdentifiedDoc[],
  framework_categories?: string[],
  message?: string
}

// ─── UI types ─────────────────────────────────────────────────────────────────
export interface AuditDocument {
  id: string
  name: string
  type: string
  status: DocumentStatus
  progress: number
  startedAt?: string
  completedAt?: string
  checks: { label: string; passed: boolean }[]
  score?: number
}

export interface AuditStep {
  id: string
  label: string
  description: string
  status: StepStatus
  startedAt?: string
  completedAt?: string
}

export interface AuditSession {
  id: string
  name: string
  projectName: string
  clientName: string
  auditType: string
  status: AuditStatus
  steps: AuditStep[]
  documents: AuditDocument[]
  currentDocumentId?: string
  currentCheck?: string
  overallProgress: number
  createdAt: string
  completedAt?: string
  reportUrl?: string
  reportName?: string
  overallScore?: number
  executiveSummary?: string
  strengths?: string[]
  risks?: string[]
  recommendations?: string[]
}

export interface AuditSummary {
  id: string
  name: string
  projectName: string
  clientName: string
  status: AuditStatus
  documentCount: number
  overallScore?: number
  auditType?: string
  createdAt: string
  completedAt?: string
  reportUrl?: string
  reportName?: string
}

export interface DashboardStats {
  total: number
  completed: number
  running: number
  failed: number
  pending: number
}

export interface ChatMessage {
  id: string
  type: ChatMessageType
  title: string
  content: string
  timestamp: string
  progress?: number
  details?: string[] | Record<string, unknown>
  confirmed?: boolean
  identifiedDocs?: IdentifiedDoc[]
}

export interface LiveLogEntry {
  id: string
  level: LogLevel
  message: string
  timestamp: string
}

export interface User {
  id: string
  name: string
  email: string
  role: string
}

export interface Notification {
  id: string
  title: string
  message: string
  timestamp: string
  read: boolean
  type: 'info' | 'success' | 'warning' | 'error'
}
