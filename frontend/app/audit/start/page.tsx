'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Loader2, ExternalLink, ChevronRight,
  UserPlus, X, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { config } from '@/lib/config'
import { TokenStore } from '@/services/api'
import { useCurrentUser } from '@/hooks'

interface QueueRow {
  session_id: string
  client_name: string
  project_name: string
  project_code: string | null
  docs_submitted: number
  audit_initiation_date: string | null
  audit_type: string
  project_start_date: string | null
  ai_audit_status: string
  ai_audit_report_url: string | null
  overall_status: string
  assigned_auditor_name: string | null
  assigned_auditor_email: string | null
}

// ── Status label (matches image: "New" = pink, "Open" = purple) ───────────────
function AuditStatusLabel({ status }: { status: string }) {
  if (status === 'completed')    return <span className="text-emerald-600 font-semibold text-[13px]">Completed</span>
  if (status === 'under_review') return <span className="text-purple-600 font-semibold text-[13px]">Open</span>
  if (status === 'pending')      return <span className="text-pink-600 font-semibold text-[13px]">New</span>
  return null
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

// ── Assign Auditor Modal ───────────────────────────────────────────────────────
interface AssignModalProps {
  sessionId: string
  clientName: string
  projectName: string
  onClose: () => void
  onAssigned: (name: string, email: string) => void
}

function AssignAuditorModal({ sessionId, clientName, projectName, onClose, onAssigned }: AssignModalProps) {
  const [email, setEmail] = useState('')
  const [name, setName]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!email.trim() || !name.trim()) { setError('Both fields are required.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address.'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch(`${config.apiUrl}/polaris/audit/${sessionId}/assign-auditor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
        body: JSON.stringify({ auditor_email: email.trim().toLowerCase(), auditor_name: name.trim() }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as any).detail ?? 'Failed') }
      onAssigned(name.trim(), email.trim())
      onClose()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[16px] font-bold text-slate-900">Assign Auditor</h2>
            <p className="text-[12px] text-slate-500 mt-0.5 truncate max-w-xs">{clientName} — {projectName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-slate-700">
              Auditor Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="auditor@procdna.com"
              className="px-3 py-2.5 text-[13.5px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-slate-700">
              Auditor Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="px-3 py-2.5 text-[13.5px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-[12.5px] text-red-700">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          {/* Note */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-[12px] text-amber-800">
            <strong>Note:</strong> After assigning, ensure the auditor is added to the Azure AD App Registration
            with the <strong>Auditor</strong> role. Their dashboard will update automatically upon next login.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button onClick={onClose}
            className="px-4 py-2 text-[13px] font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[13px] font-semibold rounded-lg transition-colors">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Assigning…' : 'Assign Auditor'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StartAuditPage() {
  const { data: currentUser } = useCurrentUser()
  const router = useRouter()
  const [rows, setRows]       = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [assignModal, setAssignModal] = useState<QueueRow | null>(null)

  const isAdmin = currentUser?.role === 'admin'

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiUrl}/polaris/audit/queue`, {
        headers: { Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setRows(await res.json())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); const iv = setInterval(load, 30_000); return () => clearInterval(iv) }, [load])

  // Guard: only admin/auditor
  if (currentUser && currentUser.role === 'user') {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
          <AlertCircle size={40} className="text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-700">Access Restricted</h2>
          <p className="text-slate-500 text-sm max-w-sm">
            The Start Audit queue is only available to administrators and auditors.
          </p>
          <Link href="/home" className="mt-2 text-blue-600 hover:underline text-sm">Go to Home</Link>
        </div>
      </AppShell>
    )
  }

  const handleAssigned = (sessionId: string, name: string, email: string) => {
    setRows(prev => prev.map(r =>
      r.session_id === sessionId
        ? { ...r, assigned_auditor_name: name, assigned_auditor_email: email }
        : r
    ))
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Start Audit</h1>
        <p className="text-[14px] text-slate-500 mt-1">
          Projects under audit and currently waiting for your review
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[1100px]">
            {/* Dark navy header — matches image */}
            <thead>
              <tr className="bg-[#0B2D5E] text-white">
                {[
                  'Client Name', 'Project Name', 'Project Code',
                  'DOCS Submitted', 'Audit Initiation Date', 'Audit Type',
                  'Project Estimated Start Date', 'Assigned Auditor', 'AI Report', 'Audit Status', '',
                ].map(h => (
                  <th key={h} className="text-center px-4 py-3.5 text-[12px] font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={11} className="px-4 py-12 text-center">
                  <Loader2 size={24} className="animate-spin text-blue-500 mx-auto" />
                </td></tr>
              ) : error ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-red-500 text-sm">{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-slate-400 text-sm">
                  No audits in the queue.
                </td></tr>
              ) : rows.map((row) => (
                <tr key={row.session_id} className="hover:bg-slate-50/60 transition-colors">
                  {/* Client Name */}
                  <td className="px-4 py-4 text-center text-blue-700 font-medium text-[13px]">{row.client_name || '—'}</td>
                  {/* Project Name */}
                  <td className="px-4 py-4 text-center text-slate-700 text-[13px] max-w-[160px]">
                    <span className="block truncate">{row.project_name || '—'}</span>
                  </td>
                  {/* Project Code */}
                  <td className="px-4 py-4 text-center text-slate-600 text-[13px]">{row.project_code || '—'}</td>
                  {/* DOCS Submitted */}
                  <td className="px-4 py-4 text-center text-slate-600 text-[13px]">
                    {row.docs_submitted || '—'}
                  </td>
                  {/* Audit Initiation Date */}
                  <td className="px-4 py-4 text-center text-slate-600 text-[13px] whitespace-nowrap">
                    {fmtDate(row.audit_initiation_date)}
                  </td>
                  {/* Audit Type */}
                  <td className="px-4 py-4 text-center text-slate-600 text-[13px]">{row.audit_type}</td>
                  {/* Project Est. Start Date */}
                  <td className="px-4 py-4 text-center text-slate-600 text-[13px] whitespace-nowrap">
                    {fmtDate(row.project_start_date)}
                  </td>
                  {/* Assigned Auditor */}
                  <td className="px-4 py-4 text-center text-[13px]">
                    {row.assigned_auditor_name ? (
                      <div>
                        <p className="text-slate-800 font-medium">{row.assigned_auditor_name}</p>
                        {row.assigned_auditor_email && (
                          <p className="text-slate-400 text-[11px]">{row.assigned_auditor_email}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[12px]">Not Assigned</span>
                    )}
                  </td>
                  {/* AI Report */}
                  <td className="px-4 py-4 text-center text-[13px]">
                    {row.ai_audit_report_url ? (
                      <a href={row.ai_audit_report_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors whitespace-nowrap">
                        AI Report <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="text-slate-400 text-[12px] italic">Not Available</span>
                    )}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-4 text-center text-[13px]">
                    <AuditStatusLabel status={row.overall_status} />
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      {/* Assign Auditor — admin only */}
                      {isAdmin && (
                        <button
                          onClick={() => setAssignModal(row)}
                          className="w-36 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-slate-600 border border-slate-300 rounded hover:bg-slate-50 transition-colors whitespace-nowrap"
                        >
                          <UserPlus size={13} />
                          {row.assigned_auditor_name ? 'Reassign' : 'Assign Auditor'}
                        </button>
                      )}
                      {/* Begin Review */}
                      <Link href={`/audit/start/${row.session_id}`}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[12.5px] font-semibold text-slate-700 border-2 border-blue-700 rounded bg-blue-700 text-white transition-colors whitespace-nowrap">
                        Begin review <ChevronRight size={13} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Auditor Modal */}
      {assignModal && (
        <AssignAuditorModal
          sessionId={assignModal.session_id}
          clientName={assignModal.client_name}
          projectName={assignModal.project_name}
          onClose={() => setAssignModal(null)}
          onAssigned={(name, email) => {
            handleAssigned(assignModal.session_id, name, email)
            setAssignModal(null)
          }}
        />
      )}
    </AppShell>
  )
}