'use client'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const COLOR_MAP = {
  slate:   { bg: 'bg-slate-100',   icon: 'text-slate-600',   value: 'text-slate-900' },
  emerald: { bg: 'bg-emerald-100', icon: 'text-emerald-600', value: 'text-emerald-700' },
  blue:    { bg: 'bg-blue-100',    icon: 'text-blue-600',    value: 'text-blue-700' },
  red:     { bg: 'bg-red-100',     icon: 'text-red-500',     value: 'text-red-700' },
  amber:   { bg: 'bg-amber-100',   icon: 'text-amber-600',   value: 'text-amber-700' },
}

interface StatCardProps {
  label: string
  value: number
  icon: LucideIcon
  color?: keyof typeof COLOR_MAP
  subtitle?: string
  loading?: boolean
}

export function StatCard({ label, value, icon: Icon, color = 'slate', subtitle, loading }: StatCardProps) {
  const c = COLOR_MAP[color]
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', c.bg)}>
          <Icon size={16} className={c.icon} />
        </div>
      </div>
      {loading ? (
        <div className="h-8 bg-slate-100 rounded animate-pulse w-16" />
      ) : (
        <p className={cn('text-3xl font-bold tabular-nums', c.value)}>{value}</p>
      )}
      {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
    </div>
  )
}
