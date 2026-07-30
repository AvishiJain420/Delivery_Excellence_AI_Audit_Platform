'use client'

import { cn, formatTimestamp } from '@/lib/utils'
import { LiveLogEntry } from '@/types'
import { useEffect, useRef } from 'react'

interface LiveLogProps {
  entries: LiveLogEntry[]
}

const LEVEL_CONFIG = {
  info:    { dot: 'bg-blue-400',    text: 'text-blue-400',    label: 'INFO' },
  success: { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'OK  ' },
  warning: { dot: 'bg-amber-400',   text: 'text-amber-400',   label: 'WARN' },
  error:   { dot: 'bg-red-400',     text: 'text-red-400',     label: 'ERR ' },
  debug:   { dot: 'bg-slate-400',   text: 'text-slate-400',   label: 'DEBG' },
}

export function LiveLog({ entries }: LiveLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300 font-mono text-[11px]">
      {/* Log header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 flex-shrink-0">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        </div>
        <span className="text-slate-500 text-[10px] ml-1">audit-agent — live event log</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {entries.length} events
        </span>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {entries.map((entry, i) => {
          const cfg = LEVEL_CONFIG[entry.level]
          return (
            <div
              key={entry.id}
              className="log-entry flex items-start gap-2.5 leading-relaxed"
              style={{ animationDelay: `${Math.min(i * 0.02, 0.3)}s` }}
            >
              <span className="text-slate-600 flex-shrink-0 tabular-nums">
                {formatTimestamp(entry.timestamp)}
              </span>
              <span className={cn('flex-shrink-0 font-bold', cfg.text)}>
                [{cfg.label}]
              </span>
              <span className={cn(
                'break-all',
                entry.level === 'error'   && 'text-red-300',
                entry.level === 'warning' && 'text-amber-300',
                entry.level === 'success' && 'text-emerald-300',
                entry.level === 'debug'   && 'text-slate-500',
                entry.level === 'info'    && 'text-slate-300',
              )}>
                {entry.message}
              </span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
