'use client'

import { cn } from '@/lib/utils'
import { AuditDocument, DocumentStatus } from '@/types'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { FileText, CheckCircle2, XCircle, Clock, Search } from 'lucide-react'
import { formatTimestamp } from '@/lib/utils'

interface DocumentQueueProps {
  documents: AuditDocument[]
  currentDocumentId?: string
  currentCheck?: string
}

export function DocumentQueue({ documents, currentDocumentId, currentCheck }: DocumentQueueProps) {
  const current = documents.find(d => d.id === currentDocumentId)
  const counts = {
    completed: documents.filter(d => d.status === 'completed').length,
    processing: documents.filter(d => d.status === 'processing').length,
    queued: documents.filter(d => d.status === 'queued').length,
    failed: documents.filter(d => d.status === 'failed').length,
  }

  return (
    <div className="flex flex-col h-full">
      {/* Current activity */}
      {current && (
        <div className="px-4 py-3 bg-blue-950 text-white flex-shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300 mb-1.5">
            AI Currently Processing
          </p>
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileText size={12} className="text-blue-200" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{current.name}</p>
              {currentCheck && (
                <p className="text-xs text-blue-300 mt-0.5 flex items-center gap-1.5">
                  <Search size={10} />
                  {currentCheck}
                </p>
              )}
              <ProgressBar
                value={current.progress}
                color="blue"
                size="xs"
                className="mt-2"
              />
              <p className="text-[10px] text-blue-400 mt-1">{current.progress}% complete</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex border-b border-slate-200 flex-shrink-0">
        {[
          { label: 'Done', count: counts.completed, color: 'text-emerald-600' },
          { label: 'Active', count: counts.processing, color: 'text-blue-600' },
          { label: 'Queued', count: counts.queued, color: 'text-slate-500' },
          { label: 'Failed', count: counts.failed, color: 'text-red-500' },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex-1 py-2 text-center border-r border-slate-100 last:border-r-0">
            <p className={cn('text-sm font-bold tabular-nums', color)}>{count}</p>
            <p className="text-[9px] text-slate-400 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {documents.map(doc => (
          <DocumentRow key={doc.id} document={doc} isCurrent={doc.id === currentDocumentId} />
        ))}
      </div>
    </div>
  )
}

function DocumentRow({ document: doc, isCurrent }: { document: AuditDocument; isCurrent: boolean }) {
  const statusIcon = {
    completed:  <CheckCircle2 size={13} className="text-emerald-500" />,
    processing: <Spinner size="xs" />,
    queued:     <Clock size={13} className="text-slate-400" />,
    failed:     <XCircle size={13} className="text-red-500" />,
  }[doc.status]

  return (
    <div className={cn(
      'px-4 py-3 transition-colors',
      isCurrent && 'bg-blue-50/60',
      !isCurrent && 'hover:bg-slate-50',
    )}>
      <div className="flex items-start gap-2.5">
        <div className="flex-shrink-0 mt-0.5">{statusIcon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-700 truncate">{doc.name}</p>
            <Badge variant={doc.status as any} className="flex-shrink-0">
              {doc.status}
            </Badge>
          </div>
          {(doc.status === 'processing' || doc.status === 'completed') && (
            <ProgressBar
              value={doc.progress}
              size="xs"
              color={doc.status === 'completed' ? 'emerald' : 'blue'}
              className="mt-1.5"
            />
          )}
          {doc.startedAt && (
            <p className="text-[10px] text-slate-400 mt-1">
              {doc.status === 'completed' && doc.completedAt
                ? `Completed ${formatTimestamp(doc.completedAt)}`
                : `Started ${formatTimestamp(doc.startedAt)}`}
            </p>
          )}
          {doc.checks && doc.checks.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {doc.checks.slice(0, 3).map((check, i) => (
                <span
                  key={i}
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded font-medium',
                    check.passed ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600',
                  )}
                >
                  {check.label}
                </span>
              ))}
              {doc.checks.length > 3 && (
                <span className="text-[9px] text-slate-400">+{doc.checks.length - 3} more</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
