'use client'
/**
 * components/audit/ValidationModal.tsx
 *
 * WHERE THIS FILE LIVES: frontend/components/audit/ValidationModal.tsx
 *
 * This is the UI for the validation_required pipeline pause.
 * Backend stops and waits. User sees identified documents and can:
 *   1. Approve as-is → pipeline continues
 *   2. Edit categories → corrected list sent, pipeline continues
 *   3. Reject → pipeline stops with error
 */
import { useState } from 'react'
import { CheckCircle2, XCircle, Edit3, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { IdentifiedDoc, DocumentCorrection } from '@/types'
import { cn } from '@/lib/utils'

interface ValidationModalProps {
  docs: IdentifiedDoc[]
  onConfirm: (approved: boolean, corrections: DocumentCorrection[]) => void
}

export function ValidationModal({ docs, onConfirm }: ValidationModalProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [corrections, setCorrections] = useState<Record<number, string>>({})
  const [expanded, setExpanded] = useState<number | null>(null)

  const handleApprove = () => {
    const corrList: DocumentCorrection[] = Object.entries(corrections).map(([i, cat]) => ({
      filename: docs[Number(i)].filename,
      new_matched_category: cat,
    }))
    onConfirm(true, corrList)
  }

  const confidenceColor = (c: string) => ({
    high: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    medium: 'text-amber-600 bg-amber-50 border-amber-200',
    low: 'text-red-600 bg-red-50 border-red-200',
  }[c] ?? 'text-slate-500 bg-slate-50 border-slate-200')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-5 border-b border-slate-200">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="text-amber-600 w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Document Identification — Review Required</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              The AI identified {docs.length} document{docs.length !== 1 ? 's' : ''}. Confirm categories before the audit continues.
            </p>
          </div>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {docs.map((doc, i) => {
            const isEditing = editingIdx === i
            const currentCat = corrections[i] ?? doc.matched_category
            const isExpanded = expanded === i

            return (
              <div
                key={i}
                className={cn(
                  'border rounded-xl transition-all',
                  doc.confidence === 'low' ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white',
                )}
              >
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.filename}</p>
                    {isEditing ? (
                      <input
                        autoFocus
                        type="text"
                        value={currentCat}
                        onChange={e => setCorrections(c => ({ ...c, [i]: e.target.value }))}
                        onBlur={() => setEditingIdx(null)}
                        onKeyDown={e => e.key === 'Enter' && setEditingIdx(null)}
                        className="mt-1 w-full text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-xs text-slate-500 mt-0.5">{currentCat}</p>
                    )}
                  </div>
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', confidenceColor(doc.confidence))}>
                    {doc.confidence}
                  </span>
                  <button
                    onClick={() => setEditingIdx(isEditing ? null : i)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit category"
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : i)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                  >
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>

                {/* Reasoning */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-0">
                    <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                      <span className="font-medium text-slate-600">AI reasoning: </span>
                      {doc.reasoning}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl">
          <button
            onClick={() => onConfirm(false, [])}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <XCircle size={14} />
            Cancel Audit
          </button>
          <button
            onClick={handleApprove}
            className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <CheckCircle2 size={14} />
            {Object.keys(corrections).length > 0
              ? `Apply ${Object.keys(corrections).length} correction(s) & Continue`
              : 'Approve & Continue Audit'}
          </button>
        </div>
      </div>
    </div>
  )
}
