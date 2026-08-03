'use client'
/**
 * app/reports/page.tsx
 *
 * FIXED:
 * - Was using mockAuditHistory for report cards (wrong design)
 * - Now fetches real reports from backend (sessions with completed reports)
 * - Table layout exactly like audit history: report name, project name, client, date, score, open button
 * - Falls back to mock data if NEXT_PUBLIC_API_URL not set
 * - Stat cards show real counts
 */
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { useReports } from '@/hooks'
import { formatRelativeTime,cn } from '@/lib/utils'
import {
  BarChart3, ExternalLink, FileSpreadsheet,
  TrendingUp, AlertTriangle, RefreshCw, Search,
} from 'lucide-react'
import { useState } from 'react'
import type { ReportRecord } from '@/services/api'

export default function ReportsPage() {
  const { data: reports = [], isLoading, refetch } = useReports()
  const [search, setSearch] = useState('')

  const filtered = reports.filter(r =>
    !search ||
    r.report_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.project_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.client_name?.toLowerCase().includes(search.toLowerCase())
  )

  // Summary stats
  const avgScore = reports.length
    ? Math.round(reports.filter(r => r.overall_score).reduce((s, r) => s + (r.overall_score ?? 0), 0) / reports.filter(r => r.overall_score).length)
    : 0

  const highRisk = reports.filter(r => r.overall_score != null && r.overall_score < 60).length

  return (
    <AppShell>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <BarChart3 size={12} />
            <span>Reports</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Audit Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Reports stored in SharePoint — click "Open" to view
          </p>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          {
            label: 'Reports Available',
            value: isLoading ? '—' : reports.length,
            icon: FileSpreadsheet,
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
          },
          {
            label: 'Avg Compliance Score',
            value: isLoading ? '—' : reports.length ? `${avgScore}%` : '—',
            icon: TrendingUp,
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-600',
          },
          {
            label: 'Below 60% Threshold',
            value: isLoading ? '—' : highRisk,
            icon: AlertTriangle,
            iconBg: 'bg-red-50',
            iconColor: 'text-red-500',
          },
        ].map(({ label, value, icon: Icon, iconBg, iconColor }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
              <Icon size={18} className={iconColor} />
            </div>
            <div>
              {isLoading
                ? <div className="h-7 w-16 bg-slate-100 rounded animate-pulse mb-1" />
                : <p className="text-2xl font-bold text-slate-800 tabular-nums">{value}</p>
              }
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
          <input
            type="text"
            placeholder="Search reports…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Reports table — same structure as audit history */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {['Report Name', 'Project', 'Client', 'Score', 'Created', 'Open'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                /* Skeleton rows */
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <FileSpreadsheet size={32} className="text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'No reports match your search.' : 'No reports yet. Complete an audit to see reports here.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((report: ReportRecord) => (
                  <tr key={report.report_id} className="hover:bg-slate-50/60 transition-colors group">
                    {/* Report name */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                          <FileSpreadsheet size={13} className="text-emerald-600" />
                        </div>
                        <span className="font-medium text-slate-700 max-w-[200px] truncate text-xs sm:text-sm">
                          {report.report_name ?? '—'}
                        </span>
                      </div>
                    </td>

                    {/* Project name */}
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {report.project_name}
                    </td>

                    {/* Client name */}
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {report.client_name || '—'}
                    </td>

                    {/* Overall score */}
                    <td className="px-5 py-3.5 tabular-nums text-xs">
                      {report.overall_score != null ? (
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                          report.overall_score >= 80 ? 'bg-emerald-50 text-emerald-700' :
                          report.overall_score >= 60 ? 'bg-amber-50 text-amber-700' :
                          'bg-red-50 text-red-700',
                        )}>
                          {report.overall_score}%
                        </span>
                      ) : '—'}
                    </td>

                    {/* Created at */}
                    <td className="px-5 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                      {formatRelativeTime(report.created_at)}
                    </td>

                    {/* Open button */}
                    <td className="px-5 py-3.5">
                      {report.sharepoint_url ? (
                        <a
                          href={report.sharepoint_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                        >
                          <ExternalLink size={11} />
                          Open Report
                        </a>
                      ) : (
                        <span className="text-xs text-slate-300">Not available</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/30">
            <p className="text-xs text-slate-400">
              {filtered.length} report{filtered.length !== 1 ? 's' : ''} shown
              {search ? ` (filtered from ${reports.length})` : ''}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
