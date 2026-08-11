'use client'
/**
 * components/audit/ValidationModal.tsx
 *
 * WHERE THIS FILE LIVES: frontend/components/audit/ValidationModal.tsx
 */
import { useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { IdentifiedDoc, DocumentCorrection } from '@/types'
import { cn } from '@/lib/utils'

interface ValidationModalProps {
  docs: IdentifiedDoc[]
  frameworkCategories: string[]
  onConfirm: (approved: boolean, corrections: DocumentCorrection[]) => void
}

export function ValidationModal({ docs, frameworkCategories, onConfirm }: ValidationModalProps) {
  // Track selected category per document index — starts with AI suggestion
  const [selections, setSelections] = useState<Record<number, string>>(
    Object.fromEntries(docs.map((d, i) => [i, d.matched_category]))
  )
  const [openDropdown, setOpenDropdown] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const handleSelect = (idx: number, category: string) => {
    setSelections(prev => ({ ...prev, [idx]: category }))
    setOpenDropdown(null)
  }

  const handleApprove = () => {
    const corrList: DocumentCorrection[] = docs
      .map((doc, i) => ({ doc, i }))
      .filter(({ doc, i }) => selections[i] !== doc.matched_category)
      .map(({ doc, i }) => ({
        filename: doc.filename,
        new_matched_category: selections[i],
      }))
    onConfirm(true, corrList)
  }

  const confidenceColor = (c: string) => ({
    high:   'text-emerald-600 bg-emerald-50 border-emerald-200',
    medium: 'text-amber-600 bg-amber-50 border-amber-200',
    low:    'text-red-600 bg-red-50 border-red-200',
  }[c] ?? 'text-slate-500 bg-slate-50 border-slate-200')

  const correctionCount = docs.filter((doc, i) => selections[i] !== doc.matched_category).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-5 border-b border-slate-200 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="text-amber-600 w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Document Identification — Review Required
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              AI identified {docs.length} document{docs.length !== 1 ? 's' : ''}.
              Use the dropdown to correct any category before continuing.
            </p>
          </div>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {docs.map((doc, i) => {
            const currentSelection = selections[i]
            const isChanged = currentSelection !== doc.matched_category
            const isExpanded = expanded === i
            const isDropdownOpen = openDropdown === i

            return (
              <div
                key={i}
                className={cn(
                  'border rounded-xl transition-all',
                  doc.confidence === 'low'
                    ? 'border-red-200 bg-red-50/30'
                    : isChanged
                    ? 'border-blue-200 bg-blue-50/20'
                    : 'border-slate-200 bg-white',
                )}
              >
                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {doc.filename}
                    </p>

                    {/* Dropdown */}
                    <div className="relative mt-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(isDropdownOpen ? null : i)}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors text-left',
                          isChanged
                            ? 'border-blue-300 bg-white text-blue-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
                        )}
                      >
                        <span className="truncate">
                          {currentSelection || 'Select category…'}
                        </span>
                        <ChevronDown
                          size={12}
                          className={cn(
                            'flex-shrink-0 transition-transform text-slate-400',
                            isDropdownOpen && 'rotate-180'
                          )}
                        />
                      </button>

                      {isDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                          {frameworkCategories.length === 0 ? (
                            <div className="px-3 py-2.5 text-xs text-slate-400">
                              No categories available
                            </div>
                          ) : (
                            frameworkCategories.map(category => (
                              <button
                                key={category}
                                type="button"
                                onClick={() => handleSelect(i, category)}
                                className={cn(
                                  'w-full text-left px-3 py-2.5 text-xs transition-colors flex items-center justify-between gap-2',
                                  category === currentSelection
                                    ? 'bg-blue-50 text-blue-700 font-semibold'
                                    : 'text-slate-700 hover:bg-slate-50'
                                )}
                              >
                                <span className="truncate">{category}</span>
                                {category === currentSelection && (
                                  <CheckCircle2 size={11} className="text-blue-500 flex-shrink-0" />
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Changed indicator */}
                    {isChanged && (
                      <p className="text-[10px] text-blue-500 mt-1">
                        Changed from: <span className="font-medium">{doc.matched_category}</span>
                      </p>
                    )}
                  </div>

                  {/* Confidence badge */}
                  <span className={cn(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0',
                    confidenceColor(doc.confidence)
                  )}>
                    {doc.confidence}
                  </span>

                  {/* Expand reasoning */}
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : i)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors flex-shrink-0"
                    title="Show AI reasoning"
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

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl flex-shrink-0">
          <button
            type="button"
            onClick={() => onConfirm(false, [])}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <XCircle size={14} />
            Cancel Audit
          </button>

          <div className="flex items-center gap-3">
            {correctionCount > 0 && (
              <p className="text-xs text-blue-500 font-medium">
                {correctionCount} correction{correctionCount !== 1 ? 's' : ''} applied
              </p>
            )}
            <button
              type="button"
              onClick={handleApprove}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <CheckCircle2 size={14} />
              {correctionCount > 0 ? 'Apply & Continue' : 'Approve & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}