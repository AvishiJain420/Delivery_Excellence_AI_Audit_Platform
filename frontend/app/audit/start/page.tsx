'use client'
/**
 * /audit/start — Start Audit (auditor queue)
 *
 * Feature 2: Delete button for admin (polaris audit sessions)
 * Feature 3: Multi-auditor management modal — admin can add/remove multiple auditors
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/link'
import {
  Loader2, ExternalLink, ChevronRight,
   X, AlertCircle, Plus, Users,
} from 'lucide-react'
import { config } from '@/lib/config'
import { TokenStore } from '@/services/api'
import { useCurrentUser } from '@/hooks'

interface Auditor {
  auditor_assignment_id?: string
  auditor_email: string
  auditor_name: string
}

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
  assigned_auditors: Auditor[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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

// ── Multi-Auditor Management Modal (Feature 3) ────────────────────────────────
interface AuditorModalProps {
  sessionId: string
  clientName: string
  projectName: string
  existingAuditors: Auditor[]
  onClose: () => void
  onChanged: (newAuditors: Auditor[]) => void
}

function ManageAuditorsModal({ sessionId, clientName, projectName, existingAuditors, onClose, onChanged }: AuditorModalProps) {
  const [auditors, setAuditors] = useState<Auditor[]>(existingAuditors)
  const [email, setEmail]       = useState('')
  const [name, setName]         = useState('')
  const [adding, setAdding]     = useState(false)
  const [removingEmail, setRemovingEmail] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const handleAdd = async () => {
    if (!email.trim() || !name.trim()) { setError('Both email and name are required.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$$/.test(email)) { setError('Enter a valid email address.'); return }
    setAdding(true); setError(null)
    try {
      const res = await fetch(`${config.apiUrl}/polaris/audit/${sessionId}/auditors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
        body: JSON.stringify({ auditor_email: email.trim().toLowerCase(), auditor_name: name.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as any).detail ?? `Error ${res.status}`)
      }
      const newEntry: Auditor = { auditor_email: email.trim().toLowerCase(), auditor_name: name.trim() }
      const updated = [...auditors, newEntry]
      setAuditors(updated)
      onChanged(updated)
      setEmail(''); setName('')
    } catch (e: any) { setError(e.message) }
    finally { setAdding(false) }
  }

  const handleRemove = async (auditorEmail: string) => {
    setRemovingEmail(auditorEmail)
    try {
      const encodedEmail = encodeURIComponent(auditorEmail)
      const res = await fetch(`${config.apiUrl}/polaris/audit/${sessionId}/auditors/${encodedEmail}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
      })
      if (!res.ok && res.status !== 204) throw new Error(`Error ${res.status}`)
      const updated = auditors.filter(a => a.auditor_email !== auditorEmail)
      setAuditors(updated)
      onChanged(updated)
    } catch (e: any) { setError(String(e)) }
    finally { setRemovingEmail(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[16px] font-bold text-slate-900">Manage Auditors</h2>
            <p className="text-[12px] text-slate-500 mt-0.5 truncate max-w-xs">{clientName} — {projectName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Current auditors */}
          {auditors.length > 0 && (
            <div className="mb-5">
              <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Assigned Auditors</p>
              <div className="flex flex-col gap-2">
                {auditors.map(a => (
                  <div key={a.auditor_email} className="flex items-center gap-3 px-3 py-2.5 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                      {a.auditor_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">{a.auditor_name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{a.auditor_email}</p>
                    </div>
                    <button onClick={() => handleRemove(a.auditor_email)}
                      disabled={removingEmail === a.auditor_email}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0">
                      {removingEmail === a.auditor_email
                        ? <Loader2 size={13} className="animate-spin" />
                        : <X size={13} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add auditor form */}
          <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Add New Auditor
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[13px] font-semibold text-slate-700 block mb-1">
                Auditor Email <span className="text-red-500">*</span>
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="auditor@procdna.com"
                className="w-full px-3 py-2.5 text-[13.5px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 block mb-1">
                Auditor Name <span className="text-red-500">*</span>
              </label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="w-full px-3 py-2.5 text-[13.5px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-[12.5px] text-red-700">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-[12px] text-amber-800">
            <strong>Note:</strong> After adding, ensure the auditor has the <strong>Auditor</strong> Azure AD role.
            Until then, they will not see this session in their queue.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
            Close
          </button>
          <button onClick={handleAdd} disabled={adding}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[13px] font-semibold rounded-lg transition-colors">
            {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {adding ? 'Adding…' : 'Add Auditor'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StartAuditPage() {
  const { data: currentUser } = useCurrentUser()
  const [rows, setRows]       = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [modalRow, setModalRow] = useState<QueueRow | null>(null)

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

  if (currentUser && currentUser.role === 'user') {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
          <AlertCircle size={40} className="text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-700">Access Restricted</h2>
          <p className="text-slate-500 text-sm max-w-sm">The Start Audit queue is only available to administrators and auditors.</p>
          <Link href="/home" className="mt-2 text-blue-600 hover:underline text-sm">Go to Home</Link>
        </div>
      </AppShell>
    )
  }

  const updateRowAuditors = (sessionId: string, newAuditors: Auditor[]) => {
    setRows(prev => prev.map(r =>
      r.session_id === sessionId ? { ...r, assigned_auditors: newAuditors } : r
    ))
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Start Audit</h1>
        <p className="text-[14px] text-slate-500 mt-1">Projects under audit and currently waiting for your review</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[1200px]">
            <thead>
              <tr className="bg-[#0B2D5E] text-white">
                {[
                  'Client Name', 'Project Name', 'Project Code', 'DOCS Submitted',
                  'Audit Initiation Date', 'Audit Type', 'Est. Start Date',
                  'Assigned Auditors', 'AI Report', 'Status', '',
                ].map(h => (
                  <th key={h} className="text-left px-4 py-3.5 text-[12px] font-semibold whitespace-nowrap">{h}</th>
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
                <tr><td colSpan={11} className="px-4 py-12 text-center text-slate-400 text-sm">No audits in the queue.</td></tr>
              ) : rows.map(row => (
                <tr key={row.session_id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-4 text-blue-700 font-medium">{row.client_name || '—'}</td>
                  <td className="px-4 py-4 text-slate-700 max-w-[150px]"><span className="block truncate">{row.project_name || '—'}</span></td>
                  <td className="px-4 py-4 text-slate-600">{row.project_code || '—'}</td>
                  <td className="px-4 py-4 text-slate-600 text-center">{row.docs_submitted || '—'}</td>
                  <td className="px-4 py-4 text-slate-600 whitespace-nowrap">{fmtDate(row.audit_initiation_date)}</td>
                  <td className="px-4 py-4 text-slate-600">{row.audit_type}</td>
                  <td className="px-4 py-4 text-slate-600 whitespace-nowrap">{fmtDate(row.project_start_date)}</td>

                  {/* Feature 3: Multi-auditor display */}
                  <td className="px-4 py-4">
                    {row.assigned_auditors && row.assigned_auditors.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {row.assigned_auditors.map(a => (
                          <div key={a.auditor_email} className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                              {a.auditor_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[12px] text-slate-700">{a.auditor_name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[12px]">Not assigned</span>
                    )}
                  </td>

                  <td className="px-4 py-4">
                    {row.ai_audit_report_url ? (
                      <a href={row.ai_audit_report_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors whitespace-nowrap">
                        AI Report <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="text-slate-400 text-[12px] italic">Not Available</span>
                    )}
                  </td>

                  <td className="px-4 py-4"><AuditStatusLabel status={row.overall_status} /></td>

                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      {/* Feature 3: Admin — manage auditors */}
                      {isAdmin && (
                        <button onClick={() => setModalRow(row)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-slate-600 border border-slate-300 rounded hover:bg-slate-50 transition-colors whitespace-nowrap"
                          title="Manage assigned auditors">
                          <Users size={13} />
                          {row.assigned_auditors?.length > 0 ? `Auditors (${row.assigned_auditors.length})` : 'Assign'}
                        </button>
                      )}
                      <Link href={`/audit/start/${row.session_id}`}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[12.5px] font-semibold text-slate-700 border-2 border-slate-700 rounded hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap">
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

      {/* Feature 3: Manage Auditors Modal */}
      {modalRow && (
        <ManageAuditorsModal
          sessionId={modalRow.session_id}
          clientName={modalRow.client_name}
          projectName={modalRow.project_name}
          existingAuditors={modalRow.assigned_auditors || []}
          onClose={() => setModalRow(null)}
          onChanged={(updated) => {
            updateRowAuditors(modalRow.session_id, updated)
          }}
        />
      )}
    </AppShell>
  )
}
