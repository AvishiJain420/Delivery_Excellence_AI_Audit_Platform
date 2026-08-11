'use client'
import { useState } from 'react'
import { useRef, useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useRecentAudits } from '@/hooks'
import { Badge } from '@/components/ui/Badge'
import { formatRelativeTime, scoreColor, statusLabel } from '@/lib/utils'
import { History, Search, ChevronDown, FileText, ExternalLink, Trash2, Check } from 'lucide-react'
import Link from 'next/link'
import { auditApi } from '@/services/api'
import { useQueryClient } from '@tanstack/react-query'

const AUDIT_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'STAR', label: 'STAR' },
  { value: 'DEX', label: 'DEX' },
]

const STATUS_OPTIONS = [
  { value: 'all',     label: 'All' },
  { value: 'done',    label: 'Completed' },
  { value: 'running', label: 'Running' },
  { value: 'failed',  label: 'Failed' },
  { value: 'pending', label: 'Pending' },
]

export default function HistoryPage() {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterAuditType, setFilterAuditType] = useState('all')

  const [openFilter, setOpenFilter] = useState<'status' | 'type' | null>(null)

  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterRef.current &&
        !filterRef.current.contains(event.target as Node)
      ) {
        setOpenFilter(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const { data: audits = [], isLoading, refetch } = useRecentAudits(50)
  const qc = useQueryClient()

  const filtered = audits.filter(a => {
    const query = search.toLowerCase()
    const matchSearch =
      !search ||
      a.name.toLowerCase().includes(query) ||
      a.projectName.toLowerCase().includes(query) ||
      (a.clientName ?? '').toLowerCase().includes(query)

    const matchStatus =
      filterStatus === 'all' ||
      a.status === filterStatus ||
      (filterStatus === 'done' && a.status === 'done')

    const matchAuditType =
      filterAuditType === 'all' ||
      (a.auditType ?? '').toUpperCase() === filterAuditType.toUpperCase()

    return matchSearch && matchStatus && matchAuditType
  })

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this audit session? This cannot be undone.')) return
    await auditApi.deleteSession(id)
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    refetch()
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <History size={12} /> <span>Document Audit and Reports History</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">All Audits</h1>
          <p className="text-sm text-slate-500 mt-0.5">{audits.length} total sessions</p>
        </div>
      </div>

      {/* Filters */}
      <div
        ref={filterRef}
        className="flex flex-wrap items-center gap-3 mb-4"
      >

        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5"
          />

          <input
            type="text"
            placeholder="Search by audit name or client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Audit Status Filter */}
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setOpenFilter(
                openFilter === 'status' ? null : 'status'
              )
            }
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-white border rounded-lg transition-colors ${
              filterStatus !== 'all'
                ? 'border-blue-300 text-blue-700 bg-blue-50/40'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <span className="font-medium">
              Audit Status:
            </span>

            <span>
              {filterStatus === 'all'
                ? 'All'
                : filterStatus === 'done'
                  ? 'Completed'
                  : filterStatus === 'failed'
                    ? 'Failed'
                    : filterStatus === 'running'
                      ? 'Running'
                      : 'Pending'}
            </span>

            <ChevronDown
              size={14}
              className={`ml-1 transition-transform ${
                openFilter === 'status' ? 'rotate-180' : ''
              }`}
            />
          </button>

          {openFilter === 'status' && (
            <div className="absolute right-0 z-50 mt-2 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1">

              {[
                { value: 'all', label: 'All' },
                { value: 'done', label: 'Completed' },
                { value: 'failed', label: 'Failed' },
                { value: 'running', label: 'Running' },
                { value: 'pending', label: 'Pending' },
              ].map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setFilterStatus(option.value)
                    setOpenFilter(null)
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                    filterStatus === option.value
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{option.label}</span>

                  {filterStatus === option.value && (
                    <Check size={14} className="text-blue-600" />
                  )}
                </button>
              ))}

            </div>
          )}
        </div>

        {/* Audit Type Filter */}
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setOpenFilter(
                openFilter === 'type' ? null : 'type'
              )
            }
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-white border rounded-lg transition-colors ${
              filterAuditType !== 'all'
                ? 'border-blue-300 text-blue-700 bg-blue-50/40'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <span className="font-medium">
              Audit Type:
            </span>

            <span>
              {filterAuditType === 'all'
                ? 'All'
                : filterAuditType}
            </span>

            <ChevronDown
              size={14}
              className={`ml-1 transition-transform ${
                openFilter === 'type' ? 'rotate-180' : ''
              }`}
            />
          </button>

          {openFilter === 'type' && (
            <div className="absolute right-0 z-50 mt-2 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1">

              {[
                { value: 'all', label: 'All' },
                { value: 'DEX', label: 'DEX' },
                { value: 'STAR', label: 'STAR' },
              ].map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setFilterAuditType(option.value)
                    setOpenFilter(null)
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                    filterAuditType === option.value
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{option.label}</span>

                  {filterAuditType === option.value && (
                    <Check size={14} className="text-blue-600" />
                  )}
                </button>
              ))}

            </div>
          )}
        </div>

      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              {['Audit Name', 'Client', 'Type', 'Docs', 'Status', 'Score', 'Created','Report', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm">Loading sessions…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm">No audits found. Start one from the dashboard.</td></tr>
            ) : filtered.map(audit => (
              <tr key={audit.id} className="hover:bg-slate-50/60 transition-colors group">
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FileText size={12} className="text-blue-600" />
                    </div>
                    <span className="font-medium text-slate-700 max-w-[160px] truncate">{audit.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-slate-500 text-xs">{audit.clientName || '—'}</td>
                <td className="px-4 py-3.5 text-slate-500 text-xs">{audit.auditType ?? '—'}</td>
                <td className="px-4 py-3.5 text-slate-500 tabular-nums text-xs">{audit.documentCount}</td>
                <td className="px-4 py-3.5">
                  <Badge variant={audit.status as any}>{statusLabel(audit.status)}</Badge>
                </td>
                <td className="px-4 py-3.5 tabular-nums text-xs">
                  <span className={scoreColor(audit.overallScore)}>
                    {audit.overallScore != null ? `${audit.overallScore}%` : '—'}
                  </span>
                </td>

                <td className="px-4 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                  {formatRelativeTime(audit.createdAt)}
                </td>

                {/* Report */}
                <td className="px-4 py-3.5">
                  {audit.reportUrl ? (
                    <a
                      href={`${audit.reportUrl}${audit.reportUrl.includes('?') ? '&' : '?'}web=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      <ExternalLink size={11} />
                      Open Report
                    </a>
                  ) : (
                    <span className="text-xs text-slate-300">
                      Not available
                    </span>
                  )}
                </td>


                {/* Existing audit actions — kept unchanged */}
                <td className="px-4 py-3.5 w-[90px]">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/audit?id=${audit.id}`}>
                      <button
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Open Audit"
                      >
                        <ExternalLink size={12} />
                      </button>
                    </Link>

                    <button
                      onClick={() => handleDelete(audit.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  )
}