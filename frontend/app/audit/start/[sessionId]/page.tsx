'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/link'
import { Loader2, FileText, ExternalLink, ChevronRight, AlertCircle } from 'lucide-react'
import { config } from '@/lib/config'
import { TokenStore } from '@/services/api'
import { useCurrentUser } from '@/hooks'

// ── Field display component ───────────────────────────────────────────────────
function FormField({ label, value, fullWidth }: {
  label: string; value?: string | null; fullWidth?: boolean
}) {
  return (
    <div className={`flex flex-col gap-1 ${fullWidth ? 'col-span-2' : ''}`}>
      <label className="text-[13px] font-semibold text-slate-700">{label}</label>
      <div className="px-3 py-2.5 border border-slate-300 rounded bg-white text-[13.5px] text-slate-800 min-h-[40px]">
        {value || ''}
      </div>
    </div>
  )
}

export default function ProjectDetailsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const { data: currentUser } = useCurrentUser()
  const [detail, setDetail]   = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // RBAC guard
  const canAccess = !currentUser || currentUser.role === 'admin' || currentUser.role === 'auditor'

  useEffect(() => {
    if (!sessionId) return
    fetch(`${config.apiUrl}/polaris/audit/${sessionId}/details`, {
      headers: { Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(`Error ${r.status}`))
      .then(setDetail)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (!canAccess) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
          <AlertCircle size={40} className="text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-700">Access Restricted</h2>
          <p className="text-slate-500 text-sm">You don't have permission to view this page.</p>
          <Link href="/home" className="text-blue-600 hover:underline text-sm mt-2">Go to Home</Link>
        </div>
      </AppShell>
    )
  }

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 size={28} className="animate-spin text-blue-500" />
      </div>
    </AppShell>
  )
  if (error || !detail) return (
    <AppShell><div className="p-6 text-red-600">{error ?? 'Not found'}</div></AppShell>
  )

  const isStarAudit = detail.audit_type === 'STAR'

  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-5">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <Link href="/audit/start" className="hover:text-blue-600">Start Audit</Link>
        <span>›</span>
        <span className="text-slate-600">Project Details</span>
      </div>

      {/* Client / project title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{detail.client_name}</h1>
        <p className="text-[14px] text-slate-500">{detail.project_name}</p>
      </div>

      {/* Form fields card — matches image 2 */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-5">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {isStarAudit ? (
            <>
              <FormField label="Estimated SOW Signed Date" value={detail.sow_signed_date} />
              <FormField label="Project Start Date (as per SOW)"  value={detail.project_start_date} />
              <FormField label="Project End Date (as per SOW)"    value={detail.project_end_date} />
              <FormField label="Project Duration (in months)"     value={detail.project_duration_months} />
              <FormField label="Project Duration (in weeks)"      value={detail.project_duration_weeks} />
              <FormField label="Estimated Budget (as per SOW) ($)" value={detail.estimated_budget} />
              <FormField label="Estimated Project Margin (%)"     value={detail.estimated_project_margin} />
              <FormField label="Discount Provided?"               value={detail.discount_provided} />
              <FormField label="Discount (%)"                     value={detail.discount_percentage} />
              <FormField label="Discount Approver's Email"        value={detail.discount_approver_email} />
              <FormField label="Project Details" value={detail.project_details} fullWidth />
            </>
          ) : (
            <>
              <FormField label="SOW Signed Date"              value={detail.sow_signed_date} />
              <FormField label="Phase"                        value={detail.phase} />
              <FormField label="Project Start Date"           value={detail.project_start_date} />
              <FormField label="Project End Date"             value={detail.project_end_date} />
              <FormField label="Actual Project Start Date"    value={detail.actual_project_start_date} />
              <FormField label="Estimated Project End Date"   value={detail.estimated_project_end_date} />
              <FormField label="Project Duration (months)"    value={detail.project_duration_months} />
              <FormField label="Project Duration (weeks)"     value={detail.project_duration_weeks} />
              <FormField label="Estimated Budget ($)"         value={detail.estimated_budget} />
              <FormField label="Consumed Budget ($)"          value={detail.consumed_budget} />
              <FormField label="Current Project Margin (%)"   value={detail.current_project_margin} />
              <FormField label="SharePoint Link"              value={detail.sharepoint_link} />
              <FormField label="Project Details"              value={detail.project_details} fullWidth />
            </>
          )}
        </div>

        {/* Documents — matching image 2 style */}
        {detail.documents?.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex flex-col gap-3">
              {detail.documents.map((doc: any) => (
                <div key={doc.document_id ?? doc.file_name}
                  className="flex items-center gap-3 group">
                  {/* File icon */}
                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-slate-500" />
                  </div>
                  {/* File name */}
                  <span className="flex-1 text-[13.5px] text-slate-700 truncate">{doc.file_name}</span>
                  {/* View Document button */}
                  {doc.sharepoint_url ? (
                    <a href={doc.sharepoint_url} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors">
                      View Document <ExternalLink size={13} />
                    </a>
                  ) : (
                    <span className="text-[12px] text-slate-400 italic">No link available</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload findings CTA — bottom of card, matches image 2 */}
        <div className="mt-6 pt-4 border-t border-slate-100">
          <Link href={`/audit/start/${sessionId}/findings`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-[14px] font-semibold rounded-lg transition-colors">
            Upload findings <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
