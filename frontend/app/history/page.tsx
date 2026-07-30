'use client'
import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useRecentAudits } from '@/hooks'
import { Badge } from '@/components/ui/Badge'
import { formatRelativeTime, scoreColor, statusLabel } from '@/lib/utils'
import { History, Search, Filter, FileText, ExternalLink, Trash2, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { auditApi } from '@/services/api'
import { useQueryClient } from '@tanstack/react-query'

export default function HistoryPage() {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const { data: audits = [], isLoading, refetch } = useRecentAudits(50)
  const qc = useQueryClient()

  const filtered = audits.filter(a => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.projectName.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || a.status === filterStatus || (filterStatus === 'completed' && a.status === 'done')
    return matchSearch && matchStatus
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
            <History size={12} /> <span>Audit History</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">All Audits</h1>
          <p className="text-sm text-slate-500 mt-0.5">{audits.length} total sessions</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
          <input type="text" placeholder="Search audits…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'done', 'running', 'failed', 'pending'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors capitalize ${
                filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}>
              {s === 'done' ? 'Completed' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              {['Audit Name', 'Client', 'Type', 'Docs', 'Status', 'Score', 'Created', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">Loading sessions…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">No audits found. Start one from the dashboard.</td></tr>
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
                <td className="px-4 py-3.5 text-slate-400 text-xs whitespace-nowrap">{formatRelativeTime(audit.createdAt)}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/audit?id=${audit.id}`}>
                      <button className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Open">
                        <ExternalLink size={12} />
                      </button>
                    </Link>
                    <button onClick={() => handleDelete(audit.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
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
