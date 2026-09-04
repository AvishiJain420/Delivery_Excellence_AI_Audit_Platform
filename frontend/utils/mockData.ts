import {
  User, Notification, DashboardStats, AuditSummary,
  AuditSession, ChatMessage, LiveLogEntry,
} from '@/types'

// ─── User ────────────────────────────────────────────────────────────────────

export const mockUser: User = {
  id: 'u1',
  name: 'Priya Sharma',
  email: 'priya.sharma@contoso.com',
  role: 'Audit Manager',
  //organization: 'Contoso Corp',
}

// ─── Notifications ───────────────────────────────────────────────────────────

export const mockNotifications: Notification[] = [
  { id: 'n1', title: 'Audit Completed', message: 'Project Atlas BRD audit finished with 91% compliance score.', timestamp: '2 min ago', read: false, type: 'success' },
  { id: 'n2', title: 'Review Required', message: 'Framework validation needs your confirmation on Project Phoenix.', timestamp: '18 min ago', read: false, type: 'warning' },
  { id: 'n3', title: 'Report Ready', message: 'Q4 Compliance Report is now available for download.', timestamp: '1 hour ago', read: true, type: 'info' },
  { id: 'n4', title: 'Audit Failed', message: 'SharePoint connection timed out during Project Zenith audit.', timestamp: '3 hours ago', read: true, type: 'error' },
]

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

export const mockDashboardStats: DashboardStats = {
  total: 142,
  completed: 118,
  running: 5,
  failed: 14,
  pending: 5,
}

// ─── Audit History ───────────────────────────────────────────────────────────

export const mockAuditHistory: AuditSummary[] = [
  { id: 'a001', name: 'Project Atlas — BRD Audit', projectName: 'Project Atlas', clientName: '', status: 'auditing',   documentCount: 14, overallScore: undefined, framework: 'ISO 27001', duration: undefined, createdAt: new Date(Date.now() - 1000 * 60 * 22).toISOString() },
  { id: 'a002', name: 'Phoenix — Compliance Review', projectName: 'Project Phoenix', clientName: '', status: 'completed', documentCount: 9,  overallScore: 91, framework: 'GDPR', duration: '14m 32s', createdAt: new Date(Date.now() - 1000 * 60 * 95).toISOString() },
  { id: 'a003', name: 'Titan Architecture Audit',   projectName: 'Project Titan',   clientName: '', status: 'completed', documentCount: 21, overallScore: 78, framework: 'SOC 2',   duration: '28m 11s', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString() },
  { id: 'a004', name: 'Zenith Security Assessment', projectName: 'Project Zenith',  clientName: '', status: 'failed',    documentCount: 7,  overallScore: undefined, framework: 'NIST', duration: '3m 08s', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() },
  { id: 'a005', name: 'Orion API Governance',       projectName: 'Project Orion',   clientName: '', status: 'completed', documentCount: 5,  overallScore: 95, framework: 'Internal', duration: '9m 44s', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString() },
  { id: 'a006', name: 'Nova Data Quality Audit',    projectName: 'Project Nova',    clientName: '', status: 'completed', documentCount: 31, overallScore: 62, framework: 'ISO 27001', duration: '41m 05s', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
]

// ─── Active Audit Session ────────────────────────────────────────────────────

export const mockAuditSession: AuditSession = {
  id: 'a001',
  name: 'Project Atlas — BRD Audit',
  projectName: 'Project Atlas',
  clientName: '',
  auditType: '',
  status: 'auditing',
  overallProgress: 42,
  createdAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
  currentDocumentId: 'doc06',
  currentCheck: 'Checking regulatory compliance clauses…',
  steps: [
    { id: 's1', label: 'Request\nReceived',    description: 'Audit request received from Power Apps',      status: 'completed', startedAt: new Date(Date.now()-1000*60*22).toISOString(), completedAt: new Date(Date.now()-1000*60*21).toISOString() },
    { id: 's2', label: 'SharePoint',           description: 'Connecting to SharePoint and authenticating', status: 'completed', startedAt: new Date(Date.now()-1000*60*21).toISOString(), completedAt: new Date(Date.now()-1000*60*20).toISOString() },
    { id: 's3', label: 'Document\nFetch',      description: 'Fetching documents from SharePoint library',  status: 'completed', startedAt: new Date(Date.now()-1000*60*20).toISOString(), completedAt: new Date(Date.now()-1000*60*18).toISOString() },
    { id: 's4', label: 'Validation',           description: 'Project details validation — user confirms',  status: 'completed', startedAt: new Date(Date.now()-1000*60*18).toISOString(), completedAt: new Date(Date.now()-1000*60*17).toISOString() },
    { id: 's5', label: 'Framework',            description: 'Framework document validation',               status: 'completed', startedAt: new Date(Date.now()-1000*60*17).toISOString(), completedAt: new Date(Date.now()-1000*60*14).toISOString() },
    { id: 's6', label: 'AI Evaluation',        description: 'Running AI evaluation on all documents',      status: 'active',   startedAt: new Date(Date.now()-1000*60*14).toISOString() },
    { id: 's7', label: 'Report\nGeneration',   description: 'Generating comprehensive audit report',       status: 'pending' },
    { id: 's8', label: 'Complete',             description: 'Audit complete — report available',           status: 'pending' },
  ],
  documents: [
    { id: 'doc01', name: 'BRD_v3.2_Final.docx',          type: 'docx', status: 'completed', progress: 100, startedAt: new Date(Date.now()-1000*60*14).toISOString(), completedAt: new Date(Date.now()-1000*60*12).toISOString(), checks: [{ label: 'Structure', passed: true }, { label: 'Completeness', passed: true }, { label: 'Compliance', passed: true }], score: 94 },
    { id: 'doc02', name: 'Technical_Architecture.docx',   type: 'docx', status: 'completed', progress: 100, startedAt: new Date(Date.now()-1000*60*12).toISOString(), completedAt: new Date(Date.now()-1000*60*10).toISOString(), checks: [{ label: 'Structure', passed: true }, { label: 'Standards', passed: false }, { label: 'Review', passed: true }], score: 82 },
    { id: 'doc03', name: 'Stakeholder_Matrix.xlsx',       type: 'xlsx', status: 'completed', progress: 100, checks: [{ label: 'Completeness', passed: true }, { label: 'Accuracy', passed: true }], score: 98 },
    { id: 'doc04', name: 'Risk_Register_Q4.xlsx',         type: 'xlsx', status: 'completed', progress: 100, checks: [{ label: 'Format', passed: true }, { label: 'Coverage', passed: false }], score: 71 },
    { id: 'doc05', name: 'Project_Charter_v2.pdf',        type: 'pdf',  status: 'completed', progress: 100, checks: [{ label: 'Signatures', passed: true }, { label: 'Dates', passed: true }], score: 100 },
    { id: 'doc06', name: 'Compliance_Checklist.xlsx',     type: 'xlsx', status: 'processing', progress: 58, startedAt: new Date(Date.now()-1000*60*2).toISOString(), checks: [] },
    { id: 'doc07', name: 'Data_Flow_Diagrams.pdf',        type: 'pdf',  status: 'queued', progress: 0, checks: [] },
    { id: 'doc08', name: 'API_Spec_v1.4.docx',            type: 'docx', status: 'queued', progress: 0, checks: [] },
    { id: 'doc09', name: 'Security_Assessment.pdf',       type: 'pdf',  status: 'queued', progress: 0, checks: [] },
    { id: 'doc10', name: 'Test_Strategy_Document.docx',   type: 'docx', status: 'queued', progress: 0, checks: [] },
    { id: 'doc11', name: 'UAT_Plan_v2.docx',              type: 'docx', status: 'queued', progress: 0, checks: [] },
    { id: 'doc12', name: 'Deployment_Runbook.pdf',        type: 'pdf',  status: 'queued', progress: 0, checks: [] },
    { id: 'doc13', name: 'Change_Management_Plan.docx',   type: 'docx', status: 'queued', progress: 0, checks: [] },
    { id: 'doc14', name: 'Executive_Summary.pptx',        type: 'pptx', status: 'queued', progress: 0, checks: [] },
  ],
}

// ─── Chat Messages ───────────────────────────────────────────────────────────

const t = (minsAgo: number) => new Date(Date.now() - 1000 * 60 * minsAgo).toISOString()

export const mockChatMessages: ChatMessage[] = [
  {
    id: 'cm1', type: 'status', title: 'Audit Request Received',
    content: 'Received audit request for Project Atlas from Power Apps portal. Initiating AI audit workflow for 14 documents.',
    timestamp: t(22),
    details: ['Triggered by: Priya Sharma', 'Source: Power Apps Integration', 'Audit ID: A-2024-001'],
  },
  {
    id: 'cm2', type: 'info', title: 'Connecting to SharePoint',
    content: 'Authenticating with SharePoint using OAuth 2.0. Connecting to Contoso tenant and locating the Project Atlas document library.',
    timestamp: t(21),
  },
  {
    id: 'cm3', type: 'success', title: 'SharePoint Connected',
    content: 'Successfully authenticated and connected to SharePoint. Found 14 documents in the Project Atlas/BRD-Documents library.',
    timestamp: t(20),
    details: ['Tenant: contoso.sharepoint.com', 'Library: BRD-Documents', 'Documents found: 14', 'Total size: 48.2 MB'],
  },
  {
    id: 'cm4', type: 'confirm', title: 'Project Details — Confirm to Continue',
    content: 'Please review and confirm the following project details before the audit proceeds. The AI will use this context for evaluation.',
    timestamp: t(18),
    confirmed: true,
    details: [
      'Project: Atlas — Digital Transformation Initiative',
      'Framework: ISO 27001 / Internal BRD Standards v4.2',
      'Scope: 14 documents across 6 categories',
      'Review Lead: Priya Sharma',
      'Deadline: 31 Jan 2025',
    ],
  },
  {
    id: 'cm5', type: 'success', title: 'Framework Document Loaded',
    content: 'BRD Evaluation Framework v4.2 loaded successfully. 47 compliance checks across 8 categories will be applied to each applicable document.',
    timestamp: t(17),
    details: ['Framework: BRD Standards v4.2', 'Total checks: 47', 'Categories: Structure, Completeness, Accuracy, Compliance, Risk, Dependencies, Approvals, Quality'],
  },
  {
    id: 'cm6', type: 'info', title: 'AI Evaluation Started',
    content: 'AI evaluation is now running. Each document is being assessed against the 47 framework checks. You can monitor progress in the Document Queue.',
    timestamp: t(14),
    progress: 42,
    details: ['Model: GPT-4o-mini with custom audit prompts', 'Parallelism: 3 documents at a time', 'Est. completion: ~8 minutes'],
  },
  {
    id: 'cm7', type: 'success', title: 'BRD_v3.2_Final.docx — Complete',
    content: 'BRD_v3.2_Final.docx scored 94/100. All critical sections present. Minor gap found in Section 7.3 (Data Retention Policy).',
    timestamp: t(12),
    details: ['Passed: 44/47 checks', 'Failed: 3/47 checks (low severity)', 'Score: 94%', 'Duration: 1m 52s'],
  },
  {
    id: 'cm8', type: 'warning', title: 'Technical_Architecture.docx — Issue Found',
    content: 'Architecture document scored 82/100. Non-standard diagram format detected in Section 4. Recommend reviewer action.',
    timestamp: t(10),
    details: ['Issue: Diagram format does not match enterprise standard v2.1', 'Section: 4.2 — System Architecture Diagram', 'Severity: Medium', 'Recommendation: Update to C4 diagram format'],
  },
  {
    id: 'cm9', type: 'progress', title: 'AI Evaluation In Progress',
    content: '5 of 14 documents evaluated. Currently processing Compliance_Checklist.xlsx — checking regulatory compliance clauses…',
    timestamp: t(2),
    progress: 42,
  },
  {
    id: 'cm10', type: 'loading', title: 'Processing',
    content: 'Evaluating regulatory compliance clauses in Compliance_Checklist.xlsx…',
    timestamp: t(0),
  },
]

// ─── Live Log ────────────────────────────────────────────────────────────────

export const mockLiveLog: LiveLogEntry[] = [
  { id: 'l01', level: 'info',    message: 'Audit workflow initialised — ID: A-2024-001',                       timestamp: t(22) },
  { id: 'l02', level: 'info',    message: 'Authenticating with SharePoint (OAuth 2.0)…',                       timestamp: t(21) },
  { id: 'l03', level: 'success', message: 'SharePoint auth successful — tenant: contoso.sharepoint.com',       timestamp: t(21) },
  { id: 'l04', level: 'info',    message: 'Scanning library: /sites/Atlas/BRD-Documents',                     timestamp: t(20) },
  { id: 'l05', level: 'success', message: '14 documents found (48.2 MB total)',                                timestamp: t(20) },
  { id: 'l06', level: 'info',    message: 'Loading framework: BRD Standards v4.2',                            timestamp: t(19) },
  { id: 'l07', level: 'success', message: 'Framework loaded — 47 checks across 8 categories',                 timestamp: t(18) },
  { id: 'l08', level: 'info',    message: 'User confirmation received — proceeding with evaluation',           timestamp: t(17) },
  { id: 'l09', level: 'info',    message: 'Starting AI evaluation (model: gpt-4o-mini, parallelism: 3)',       timestamp: t(14) },
  { id: 'l10', level: 'info',    message: '[doc01] BRD_v3.2_Final.docx — evaluation started',                 timestamp: t(14) },
  { id: 'l11', level: 'info',    message: '[doc02] Technical_Architecture.docx — evaluation started',         timestamp: t(14) },
  { id: 'l12', level: 'info',    message: '[doc03] Stakeholder_Matrix.xlsx — evaluation started',             timestamp: t(14) },
  { id: 'l13', level: 'success', message: '[doc01] BRD_v3.2_Final.docx — PASS (44/47 checks) — score: 94%',  timestamp: t(12) },
  { id: 'l14', level: 'warning', message: '[doc02] Non-standard diagram format in section 4.2',               timestamp: t(10) },
  { id: 'l15', level: 'success', message: '[doc02] Technical_Architecture.docx — PASS (38/47) — score: 82%', timestamp: t(10) },
  { id: 'l16', level: 'success', message: '[doc03] Stakeholder_Matrix.xlsx — PASS (47/47) — score: 98%',     timestamp: t(9) },
  { id: 'l17', level: 'success', message: '[doc04] Risk_Register_Q4.xlsx — PASS (33/47) — score: 71%',       timestamp: t(7) },
  { id: 'l18', level: 'success', message: '[doc05] Project_Charter_v2.pdf — PASS (47/47) — score: 100%',     timestamp: t(5) },
  { id: 'l19', level: 'info',    message: '[doc06] Compliance_Checklist.xlsx — evaluation started',           timestamp: t(2) },
  { id: 'l20', level: 'debug',   message: '[doc06] Running check: regulatory_compliance_clauses',             timestamp: t(1) },
  { id: 'l21', level: 'debug',   message: '[doc06] Running check: gdpr_article_30_requirements',             timestamp: t(0) },
]

import type { AuditQueueRow } from '@/types/polaris'
import type { QueueRow } from '@/app/audit/start/page'
export const mockAuditQueue: AuditQueueRow[] = [
  {
    session_id: 'a001',
    client_name: 'Contoso Corp',
    project_name: 'Project Atlas',
    project_code: 'ATL-001',
    docs_submitted: 14,
    audit_initiation_date: '2025-01-10T00:00:00.000Z',
    audit_type: 'STAR',
    project_start_date: '2025-01-15T00:00:00.000Z',
    ai_audit_status: 'auditing',
    overall_status: 'pending',
  },
  {
    session_id: 'a002',
    client_name: 'Fabrikam Ltd',
    project_name: 'Project Phoenix',
    project_code: 'PHX-002',
    docs_submitted: 9,
    audit_initiation_date: '2025-01-08T00:00:00.000Z',
    audit_type: 'DEX',
    project_start_date: '2025-01-20T00:00:00.000Z',
    ai_audit_status: 'completed',
    overall_status: 'under_review',
  },
  {
    session_id: 'a003',
    client_name: 'Northwind Inc',
    project_name: 'Project Zenith',
    project_code: 'ZEN-003',
    docs_submitted: 7,
    audit_initiation_date: '2025-01-05T00:00:00.000Z',
    audit_type: 'STAR',
    project_start_date: '2025-01-18T00:00:00.000Z',
    ai_audit_status: 'completed',
    overall_status: 'pending',
  },
]

export const mockQueue: QueueRow[] = [
  {
    session_id: 'AUD-001',
    client_name: 'Acme Corporation',
    project_name: 'Project Atlas',
    project_code: 'ATL-001',
    docs_submitted: 14,
    audit_initiation_date: '2026-08-18T00:00:00.000Z',
    audit_type: 'STAR',
    project_start_date: '2026-09-05T00:00:00.000Z',
    ai_audit_status: 'completed',
    ai_audit_report_url: 'https://example.com/reports/AUD-001',
    overall_status: 'pending',
    assigned_auditor_name: 'Priya Sharma',
    assigned_auditor_email: 'priya.sharma@example.com',
  },
  {
    session_id: 'AUD-002',
    client_name: 'Globex Industries',
    project_name: 'Project Phoenix',
    project_code: 'PHX-002',
    docs_submitted: 9,
    audit_initiation_date: '2026-08-21T00:00:00.000Z',
    audit_type: 'ISO 27001',
    project_start_date: '2026-09-08T00:00:00.000Z',
    ai_audit_status: 'auditing',
    ai_audit_report_url: null,
    overall_status: 'under_review',
    assigned_auditor_name: 'Polaris Developer',
    assigned_auditor_email: 'developer@polaris.local',
  },
  {
    session_id: 'AUD-003',
    client_name: 'Northwind Technologies',
    project_name: 'Project Zenith',
    project_code: 'ZEN-003',
    docs_submitted: 22,
    audit_initiation_date: '2026-08-25T00:00:00.000Z',
    audit_type: 'STAR',
    project_start_date: '2026-09-12T00:00:00.000Z',
    ai_audit_status: 'fetching',
    ai_audit_report_url: null,
    overall_status: 'not_started',
    assigned_auditor_name: null,
    assigned_auditor_email: null,
  },
  {
    session_id: 'AUD-004',
    client_name: 'Wayne Enterprises',
    project_name: 'Digital Transformation',
    project_code: 'WAY-004',
    docs_submitted: 17,
    audit_initiation_date: '2026-08-27T00:00:00.000Z',
    audit_type: 'DEX',
    project_start_date: '2026-09-15T00:00:00.000Z',
    ai_audit_status: 'done',
    ai_audit_report_url: 'https://example.com/reports/AUD-004',
    overall_status: 'pending',
    assigned_auditor_name: 'Ananya Kapoor',
    assigned_auditor_email: 'ananya.kapoor@example.com',
  },
  {
    session_id: 'AUD-005',
    client_name: 'Stark Solutions',
    project_name: 'Cloud Migration',
    project_code: null,
    docs_submitted: 6,
    audit_initiation_date: null,
    audit_type: 'STAR',
    project_start_date: null,
    ai_audit_status: 'pending',
    ai_audit_report_url: null,
    overall_status: 'pending',
    assigned_auditor_name: null,
    assigned_auditor_email: null,
  },
]