'use client'
import { FileText, ExternalLink, ArrowRight } from 'lucide-react'
import { formatRelativeTime, scoreColor, statusLabel } from '@/lib/utils'
import type { AuditSummary } from '@/types'
import { Badge } from '@/components/ui/Badge'
import Link from 'next/link'

interface RecentAuditsTableProps {
  audits: AuditSummary[]
  loading?: boolean
}

export function RecentAuditsTable({ audits, loading }: RecentAuditsTableProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-800">Recent Audits</h2>
        <Link href="/history" className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:underline">
          View all <ArrowRight size={11} />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[540px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              {['Project', 'Client', 'Type', 'Status', 'Score', 'Created', ''].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : audits.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-sm">
                  No audits yet. Click "Start New Audit" to begin.
                </td>
              </tr>
            ) : audits.map(audit => (
              <tr key={audit.id} className="hover:bg-slate-50/60 transition-colors group">
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FileText size={12} className="text-blue-600" />
                    </div>
                    <span className="font-medium text-slate-700 max-w-[160px] truncate">{audit.projectName}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-slate-500 text-xs">{audit.clientName || '—'}</td>
                <td className="px-5 py-3.5 text-slate-500 text-xs">{audit.auditType ?? '—'}</td>
                <td className="px-5 py-3.5">
                  <Badge variant={audit.status as any}>{statusLabel(audit.status)}</Badge>
                </td>
                <td className="px-5 py-3.5 tabular-nums text-xs">
                  <span className={scoreColor(audit.overallScore)}>
                    {audit.overallScore != null ? `${audit.overallScore}%` : '—'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-400 text-xs whitespace-nowrap">{formatRelativeTime(audit.createdAt)}</td>
                <td className="px-5 py-3.5">
                  <Link href={`/audit?id=${audit.id}`}>
                    <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                      <ExternalLink size={12} />
                    </button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
