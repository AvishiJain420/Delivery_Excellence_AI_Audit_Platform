'use client'
/**
 * /overall-history — Combined STAR & DEX Audit History
 * Shows form submission details + AI audit status + manual auditor scores
 */
import { useState, useEffect, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/link'
import {
  Loader2, Search, ChevronDown, FileText, ExternalLink,
  CheckCircle2, AlertTriangle, Clock, Plus, Check,
} from 'lucide-react'
import { useCurrentUser } from '@/hooks'
import { config } from '@/lib/config'
import { TokenStore } from '@/services/api'

interface OverallAuditRow {
  session_id: string
  client_name: string
  project_name: string
  project_code?: string | null
  audit_type: string
  submitted_at?: string | null
  submitted_by?: string | null
  ai_audit_status: string
  ai_audit_score?: number | null
  manual_score?: number | null
  overall_status: string
  has_report: boolean
  report_url?: string | null
  assigned_auditor_name?: string | null
}

function AiStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:     { cls: 'bg-slate-100 text-slate-500',     label: 'Not Started' },
    not_started: { cls: 'bg-slate-100 text-slate-500',     label: 'Not Started' },
    fetching:    { cls: 'bg-blue-100 text-blue-700',       label: 'Running' },
    identifying: { cls: 'bg-blue-100 text-blue-700',       label: 'Running' },
    parsing:     { cls: 'bg-blue-100 text-blue-700',       label: 'Running' },
    auditing:    { cls: 'bg-blue-100 text-blue-700',       label: 'Auditing' },
    summarising: { cls: 'bg-blue-100 text-blue-700',       label: 'Summarising' },
    exporting:   { cls: 'bg-blue-100 text-blue-700',       label: 'Exporting' },
    uploading:   { cls: 'bg-blue-100 text-blue-700',       label: 'Uploading' },
    done:        { cls: 'bg-emerald-100 text-emerald-700', label: 'AI Complete' },
    failed:      { cls: 'bg-red-100 text-red-700',         label: 'Failed' },
  }
  const { cls, label } = map[status] ?? { cls: 'bg-slate-100 text-slate-500', label: status }
  const spinning = ['fetching','identifying','parsing','auditing','summarising','exporting','uploading'].includes(status)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {status === 'done' && <CheckCircle2 size={10} />}
      {status === 'failed' && <AlertTriangle size={10} />}
      {spinning && <Loader2 size={10} className="animate-spin" />}
      {(status === 'pending' || status === 'not_started') && <Clock size={10} />}
      {label}
    </span>
  )
}

function OverallStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:      { cls: 'bg-slate-100 text-slate-600',    label: 'Pending' },
    under_review: { cls: 'bg-blue-100 text-blue-700',      label: 'Under Review' },
    completed:    { cls: 'bg-emerald-100 text-emerald-700', label: 'Completed' },
    failed:       { cls: 'bg-red-100 text-red-700',        label: 'Failed' },
  }
  const { cls, label } = map[status] ?? map.pending
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

function ScorePill({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-slate-300 text-xs">—</span>
  const cls = score >= 4 ? 'text-emerald-600' : score >= 2.5 ? 'text-amber-600' : 'text-red-600'
  return <span className={`text-xs font-bold tabular-nums ${cls}`}>{score.toFixed(1)}/5</span>
}

function FilterDropdown({ label, value, options, onChange }: {
  label: string; value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const current = options.find(o => o.value === value)?.label ?? value
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(p => !p)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-white border rounded-lg transition-colors ${
          value !== 'all' ? 'border-blue-300 text-blue-700 bg-blue-50/40' : 'border-slate-200 text-slate-600 hover:border-slate-300'
        }`}
      >
        <span className="font-medium">{label}:</span>
        <span>{current}</span>
        <ChevronDown size={14} className={`ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          {options.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                value === opt.value ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
              {value === opt.value && <Check size={13} className="text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OverallAuditHistoryPage() {
  const { data: currentUser } = useCurrentUser()
  const [rows, setRows] = useState<OverallAuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = () => {
    fetch(`${config.apiUrl}/polaris/audit/history`, {
      headers: { Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(`Error ${r.status}`))
      .then(setRows)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(); const iv = setInterval(load, 30_000); return () => clearInterval(iv) }, [])

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return (
      (!search || r.client_name?.toLowerCase().includes(q) ||
        r.project_name?.toLowerCase().includes(q) ||
        (r.project_code ?? '').toLowerCase().includes(q)) &&
      (typeFilter === 'all' || r.audit_type === typeFilter) &&
      (statusFilter === 'all' || r.overall_status === statusFilter)
    )
  })

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link href="/home" className="hover:text-blue-600">Home</Link>
            <span>›</span>
            <Link href="/audit" className="hover:text-blue-600">Audit</Link>
            <span>›</span>
            <span>Overall Audit History</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Overall Audit History</h1>
            {currentUser?.role === 'admin' && (
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full">Admin View</span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Combined STAR &amp; DEX audits — form details + AI status + auditor findings
          </p>
        </div>
        <Link href="/audit/initiate"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors shadow-sm">
          <Plus size={14} /> Initiate Audit
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search client, project, code…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <FilterDropdown label="Type" value={typeFilter}
          options={[{ value: 'all', label: 'All' }, { value: 'STAR', label: 'STAR' }, { value: 'DEX', label: 'DEX' }]}
          onChange={setTypeFilter} />
        <FilterDropdown label="Status" value={statusFilter}
          options={[
            { value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' },
            { value: 'under_review', label: 'Under Review' }, { value: 'completed', label: 'Completed' },
          ]}
          onChange={setStatusFilter} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-[13px] min-w-[1050px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {['Client', 'Project', 'Code', 'Type', 'Submitted', 'Auditor', 'AI Status', 'AI Score', 'Manual Score', 'Status', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-12 text-center">
                <Loader2 size={22} className="animate-spin text-blue-500 mx-auto" />
              </td></tr>
            ) : error ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-red-500 text-sm">{error}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-slate-400 text-sm">
                No audits found.{' '}
                <Link href="/audit/initiate" className="text-blue-600 hover:underline">Initiate one →</Link>
              </td></tr>
            ) : filtered.map(row => (
              <tr key={row.session_id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FileText size={12} className="text-blue-600" />
                    </div>
                    <span className="font-medium text-slate-800 max-w-[110px] truncate">{row.client_name || '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-slate-600 max-w-[150px]"><span className="truncate block">{row.project_name || '—'}</span></td>
                <td className="px-4 py-3.5 text-slate-500 text-xs">{row.project_code || '—'}</td>
                <td className="px-4 py-3.5">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${row.audit_type === 'STAR' ? 'bg-blue-100 text-blue-700' : 'bg-blue-100 text-blue-800'}`}>
                    {row.audit_type}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                  {row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3.5 text-slate-500 text-xs">{row.assigned_auditor_name || '—'}</td>
                <td className="px-4 py-3.5"><AiStatusBadge status={row.ai_audit_status} /></td>
                <td className="px-4 py-3.5 text-center"><ScorePill score={row.ai_audit_score} /></td>
                <td className="px-4 py-3.5 text-center"><ScorePill score={row.manual_score} /></td>
                <td className="px-4 py-3.5"><OverallStatusBadge status={row.overall_status} /></td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-2">
                    <Link href={`/audit/history/${row.session_id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors whitespace-nowrap">
                      View
                    </Link>
                    {row.report_url && (
                      <a href={row.report_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap">
                        <ExternalLink size={11} /> Report
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && <p className="text-xs text-slate-400 mt-3">{filtered.length} of {rows.length} audit{rows.length !== 1 ? 's' : ''}</p>}
    </AppShell>
  )
}
