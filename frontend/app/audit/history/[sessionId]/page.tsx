'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/link'
import {
  Loader2, CheckCircle2, AlertTriangle, Clock,
  ExternalLink, FileText, BarChart2, User, Bot,
} from 'lucide-react'
import { config } from '@/lib/config'
import { TokenStore } from '@/services/api'
import type { AuditFormDetail } from '@/types/polaris'

// ── Sub-components ─────────────────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-5">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <Icon size={16} className="text-blue-600" />
        <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-[13.5px] text-slate-800">{value || '—'}</span>
    </div>
  )
}

function AiStatusBlock({ status, score, reportUrl }: {
  status: string; score?: number | null; reportUrl?: string | null
}) {
  const configs: Record<string, { icon: React.ElementType; cls: string; label: string }> = {
    not_started:  { icon: Clock,          cls: 'text-slate-500 bg-slate-50 border-slate-200',    label: 'Not Started' },
    pending:      { icon: Clock,          cls: 'text-slate-500 bg-slate-50 border-slate-200',    label: 'Not Started' },
    queued:       { icon: Clock,          cls: 'text-blue-600 bg-blue-50 border-blue-200',       label: 'Queued' },
    fetching:     { icon: Loader2,        cls: 'text-blue-600 bg-blue-50 border-blue-200',       label: 'Fetching Documents' },
    identifying:  { icon: Loader2,        cls: 'text-blue-600 bg-blue-50 border-blue-200',       label: 'Identifying' },
    parsing:      { icon: Loader2,        cls: 'text-blue-600 bg-blue-50 border-blue-200',       label: 'Parsing' },
    auditing:     { icon: Loader2,        cls: 'text-amber-600 bg-amber-50 border-amber-200',    label: 'Auditing' },
    summarising:  { icon: Loader2,        cls: 'text-amber-600 bg-amber-50 border-amber-200',    label: 'Summarising' },
    exporting:    { icon: Loader2,        cls: 'text-amber-600 bg-amber-50 border-amber-200',    label: 'Exporting' },
    done:         { icon: CheckCircle2,   cls: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Completed' },
    failed:       { icon: AlertTriangle,  cls: 'text-red-600 bg-red-50 border-red-200',          label: 'Failed' },
  }
  const cfg = configs[status] ?? configs.not_started
  const Icon = cfg.icon
  const isLoading = ['fetching','identifying','parsing','auditing','summarising','exporting'].includes(status)

  return (
    <div className={`flex items-start justify-between gap-4 p-4 border rounded-lg ${cfg.cls}`}>
      <div className="flex items-center gap-3">
        <Icon size={20} className={isLoading ? 'animate-spin' : ''} />
        <div>
          <p className="text-[14px] font-semibold">AI Document Audit: {cfg.label}</p>
          {score != null && (
            <p className="text-[12.5px] mt-0.5">
              Score: <strong>{score.toFixed(1)} / 5</strong>
            </p>
          )}
        </div>
      </div>
      {reportUrl && (
        <a
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-semibold bg-white border border-current rounded hover:opacity-80 transition-opacity whitespace-nowrap flex-shrink-0"
        >
          AI Report <ExternalLink size={12} />
        </a>
      )}
    </div>
  )
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = (score / 5) * 100
  const barColor = score >= 4 ? 'bg-emerald-500' : score >= 2.5 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-700">{score.toFixed(1)}/5</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AuditHistoryDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [detail, setDetail] = useState<AuditFormDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    const load = async () => {
      try {
        const res = await fetch(`${config.apiUrl}/polaris/audit/${sessionId}/details`, {
          headers: { Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
        })
        if (!res.ok) throw new Error(`Error ${res.status}`)
        setDetail(await res.json())
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 15_000) // poll for AI status updates
    return () => clearInterval(interval)
  }, [sessionId])

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 size={28} className="animate-spin text-blue-500" />
        </div>
      </AppShell>
    )
  }

  if (error || !detail) {
    return (
      <AppShell>
        <div className="p-6 text-red-600">{error ?? 'Audit not found.'}</div>
      </AppShell>
    )
  }

  const findings = detail.findings
  const overallManualScore = findings?.overall_score ?? null

  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <Link href="/audit/start" className="hover:text-blue-600">Audit History</Link>
        <span>›</span>
        <span className="text-slate-600">{detail.client_name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{detail.client_name}</h1>
          <p className="text-[14px] text-slate-500">{detail.project_name}</p>
        </div>
        {/* Overall score badge */}
        <div className="flex-shrink-0 bg-white border border-slate-200 rounded-lg px-5 py-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-slate-900">
            {overallManualScore != null
              ? overallManualScore.toFixed(1)
              : detail.ai_audit_score != null
                ? detail.ai_audit_score.toFixed(1)
                : '—'}{' '}
            <small className="text-[14px] text-slate-400 font-normal">/ 5</small>
          </div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wide mt-0.5">Overall Score</div>
        </div>
      </div>

      {/* AI Document Audit status */}
      <SectionCard title="AI Document Audit" icon={Bot}>
        <AiStatusBlock
          status={detail.ai_audit_status}
          score={detail.ai_audit_score}
          reportUrl={detail.ai_audit_report_url}
        />
      </SectionCard>

      {/* Manual findings / scores */}
      {findings && (
        <SectionCard title="Auditor Findings" icon={BarChart2}>
          {/* Bar chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            {findings.categories.map(cat => {
              const avg = cat.scores.reduce((s, x) => s + x.manual_score, 0) / (cat.scores.length || 1)
              return <ScoreBar key={cat.category} label={cat.category} score={avg} />
            })}
          </div>

          {/* Auditor comments */}
          {findings.auditor_comments && (
            <div className="mt-4">
              <p className="text-[13px] font-semibold text-slate-700 mb-1">Auditor Comments</p>
              <div className="bg-slate-50 border border-slate-200 rounded p-3 text-[13px] text-slate-700 whitespace-pre-wrap">
                {findings.auditor_comments}
              </div>
            </div>
          )}

          {/* Auditor info */}
          {findings.auditor_name && (
            <div className="mt-3 flex items-center gap-2 text-[12.5px] text-slate-500">
              <User size={13} />
              Reviewed by <strong className="text-slate-700">{findings.auditor_name}</strong>
              {findings.auditor_email && (
                <span className="text-slate-400">({findings.auditor_email})</span>
              )}
              {findings.submitted_at && (
                <span>· {new Date(findings.submitted_at).toLocaleDateString()}</span>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* Project / form details */}
      <SectionCard title="Project Information" icon={FileText}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          <Field label="Client Name" value={detail.client_name} />
          <Field label="Project Name" value={detail.project_name} />
          <Field label="Project Code" value={detail.project_code} />
          <Field label="Project Manager" value={detail.project_manager} />
          <Field label="Audit Type" value={detail.audit_type} />
          <Field label="Phase" value={detail.phase} />
          <Field label="SOW Signed Date" value={detail.sow_signed_date} />
          <Field label="Project Start Date" value={detail.project_start_date} />
          <Field label="Project End Date" value={detail.project_end_date} />
          <Field label="Actual Start Date" value={detail.actual_project_start_date} />
          <Field label="Estimated End Date" value={detail.estimated_project_end_date} />
          <Field label="Estimated Budget" value={detail.estimated_budget} />
          <Field label="Submitted By" value={detail.submitted_by} />
          <Field label="Submitted At" value={
            detail.submitted_at ? new Date(detail.submitted_at).toLocaleString() : null
          } />
        </div>

        {detail.project_details && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Project Details</p>
            <p className="text-[13.5px] text-slate-800">{detail.project_details}</p>
          </div>
        )}
      </SectionCard>

      {/* Documents */}
      {detail.documents.length > 0 && (
        <SectionCard title={`Documents (${detail.documents.length})`} icon={FileText}>
          <div className="divide-y divide-slate-100 -mx-5 -my-5">
            {detail.documents.map(doc => (
              <div key={doc.document_id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-blue-600" />
                </div>
                <span className="flex-1 text-[13.5px] text-slate-700 truncate">{doc.file_name}</span>
                {doc.sharepoint_url ? (
                  <a
                    href={doc.sharepoint_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                  >
                    View <ExternalLink size={11} />
                  </a>
                ) : (
                  <span className="text-[12px] text-slate-300">No link</span>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 mt-2">
        {detail.ai_audit_report_url && (
          <a
            href={detail.ai_audit_report_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold rounded-lg transition-colors"
          >
            View AI Doc Review Report <ExternalLink size={13} />
          </a>
        )}
        <Link
          href={`/audit/start/${sessionId}/findings`}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-blue-200 text-blue-600 hover:bg-blue-50 text-[13.5px] font-semibold rounded-lg transition-colors"
        >
          {findings ? 'Edit Findings' : 'Upload Findings'}
        </Link>
      </div>
    </AppShell>
  )
}
