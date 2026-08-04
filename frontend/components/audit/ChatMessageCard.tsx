'use client'

import { cn, formatTimestamp } from '@/lib/utils'
import { ChatMessage, ChatMessageType } from '@/types'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { LoadingDots } from '@/components/ui/Spinner'
import {
  CheckCircle2, XCircle, AlertTriangle, Info, Bot,
  ChevronDown, ChevronUp, Clock,
} from 'lucide-react'
import { useState } from 'react'

interface ChatMessageCardProps {
  message: ChatMessage
  onConfirm?: (messageId: string, accepted: boolean) => void
}

export function ChatMessageCard({ message, onConfirm }: ChatMessageCardProps) {
  const [expanded, setExpanded] = useState(message.type === 'confirm' || message.type === 'summary')

  const typeConfig: Record<ChatMessageType, {
    icon: React.ReactNode
    border: string
    bg: string
    header: string
  }> = {
    status: {
      icon: <Bot size={14} className="text-blue-600" />,
      border: 'border-slate-200',
      bg: 'bg-white',
      header: 'bg-slate-50',
    },
    info: {
      icon: <Info size={14} className="text-blue-500" />,
      border: 'border-blue-200',
      bg: 'bg-blue-50/40',
      header: 'bg-blue-50',
    },
    success: {
      icon: <CheckCircle2 size={14} className="text-emerald-500" />,
      border: 'border-emerald-200',
      bg: 'bg-emerald-50/30',
      header: 'bg-emerald-50',
    },
    error: {
      icon: <XCircle size={14} className="text-red-500" />,
      border: 'border-red-200',
      bg: 'bg-red-50/30',
      header: 'bg-red-50',
    },
    warning: {
      icon: <AlertTriangle size={14} className="text-amber-500" />,
      border: 'border-amber-200',
      bg: 'bg-amber-50/30',
      header: 'bg-amber-50',
    },
    confirm: {
      icon: <AlertTriangle size={14} className="text-amber-500" />,
      border: 'border-amber-300',
      bg: 'bg-amber-50/50',
      header: 'bg-amber-50',
    },
    summary: {
      icon: <CheckCircle2 size={14} className="text-emerald-500" />,
      border: 'border-emerald-300',
      bg: 'bg-emerald-50/20',
      header: 'bg-emerald-50',
    },
    progress: {
      icon: <Bot size={14} className="text-blue-600" />,
      border: 'border-blue-200',
      bg: 'bg-white',
      header: 'bg-blue-50',
    },
    loading: {
      icon: <Bot size={14} className="text-slate-400" />,
      border: 'border-slate-200',
      bg: 'bg-white',
      header: 'bg-slate-50',
    },
  }

  const cfg = typeConfig[message.type]
  const progressColor =
  message.type === 'success' || message.type === 'summary'
    ? 'bg-emerald-500'
    : message.type === 'warning' || message.type === 'confirm'
      ? 'bg-amber-500'
      : message.type === 'error'
        ? 'bg-red-500'
        : 'bg-blue-600'

  return (
    <div className={cn(
      'chat-message rounded-xl border overflow-hidden shadow-sm',
      cfg.border, cfg.bg,
    )}>
      {/* Header */}
      <div className={cn('flex items-center justify-between px-4 py-2.5', cfg.header)}>
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0">{cfg.icon}</div>
          <span className="text-xs font-semibold text-slate-700">{message.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <Clock size={10} />
            {formatTimestamp(message.timestamp)}
          </span>
          {message.details && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {message.type === 'loading' ? (
          <div className="flex items-center gap-2 text-slate-400">
            {message.progress !== 100 && <LoadingDots />}
            <span className="text-xs">{message.content}</span>
          </div>
        ) : (
          <p className="text-sm text-slate-600 leading-relaxed">{message.content}</p>
        )}

        {/* Progress bar */}
        {message.progress != null && (
          <div className="mt-2.5">
            <ProgressBar
              value={message.progress}
              color={
                message.type === 'success'
                  ? 'emerald'
                  : message.type === 'error'
                  ? 'red'
                  : message.type === 'warning'
                  ? 'amber'
                  : 'blue'
              }
              size="sm"
            />
          </div>
        )}

        {/* Expandable details */}
        {expanded && message.details && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            {Array.isArray(message.details) ? (
              <ul className="space-y-1.5">
                {(message.details as string[]).map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-slate-300" />
                    {d}
                  </li>
                ))}
              </ul>
            ) : (
              <pre className="text-xs text-slate-600 font-mono bg-slate-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(message.details, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Confirm actions */}
        {message.type === 'confirm' && !message.confirmed && onConfirm && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => onConfirm(message.id, true)}>
              ✓ Confirm & Continue
            </Button>
            <Button size="sm" variant="outline" onClick={() => onConfirm(message.id, false)}>
              Cancel Audit
            </Button>
          </div>
        )}
        {message.type === 'confirm' && message.confirmed != null && (
          <div className={cn(
            'mt-2 text-xs font-medium flex items-center gap-1.5',
            message.confirmed ? 'text-emerald-600' : 'text-red-500',
          )}>
            {message.confirmed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {message.confirmed ? 'Details confirmed — audit continuing.' : 'Audit cancelled by user.'}
          </div>
        )}
      </div>
    </div>
  )
}
