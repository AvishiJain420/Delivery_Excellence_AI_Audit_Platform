'use client'

import { cn } from '@/lib/utils'
import { AuditStep, StepStatus } from '@/types'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

interface AuditTimelineProps {
  steps: AuditStep[]
}

export function AuditTimeline({ steps }: AuditTimelineProps) {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-start gap-0 overflow-x-auto pb-1">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1
          return (
            <div key={step.id} className="flex items-center min-w-0 flex-shrink-0">
              {/* Node */}
              <div className="step-node">
                <NodeCircle status={step.status} index={i + 1} />
                <p className={cn(
                  'text-[10px] font-medium mt-1.5 text-center leading-tight max-w-[72px]',
                  step.status === 'completed' && 'text-emerald-600',
                  step.status === 'active'    && 'text-blue-600',
                  step.status === 'pending'   && 'text-slate-400',
                  step.status === 'failed'    && 'text-red-500',
                )}>
                  {step.label}
                </p>
                {step.completedAt && step.status === 'completed' && (
                  <p className="text-[9px] text-slate-300 text-center mt-0.5">
                    {new Date(step.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
              {/* Connector */}
              {!isLast && (
                <div className={cn(
                  'step-connector w-12 mx-1',
                  step.status === 'completed' && 'done',
                  step.status === 'active'    && 'active',
                  step.status === 'pending'   && 'pending',
                  step.status === 'failed'    && 'bg-red-200',
                )} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NodeCircle({ status, index }: { status: StepStatus; index: number }) {
  if (status === 'completed') return (
    <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
      <CheckCircle2 size={16} className="text-white" />
    </div>
  )
  if (status === 'active') return (
    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shadow-[0_0_0_4px_rgba(37,99,235,0.15)]">
      <Spinner size="xs" className="text-white" />
    </div>
  )
  if (status === 'failed') return (
    <div className="w-8 h-8 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center">
      <XCircle size={14} className="text-red-500" />
    </div>
  )
  if (status === 'skipped') return (
    <div className="w-8 h-8 rounded-full bg-amber-50 border-2 border-amber-300 flex items-center justify-center">
      <AlertCircle size={14} className="text-amber-500" />
    </div>
  )
  return (
    <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center">
      <span className="text-xs font-semibold text-slate-400">{index}</span>
    </div>
  )
}
