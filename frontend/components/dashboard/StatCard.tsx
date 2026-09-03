import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: number
  icon: LucideIcon
  color: 'slate' | 'emerald' | 'blue' | 'red'
  subtitle?: string
  loading?: boolean
  compact?: boolean   // NEW — reduces height
}

const colorMap = {
  slate:   { bg: 'bg-slate-100',   text: 'text-slate-600',   val: 'text-slate-900' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', val: 'text-emerald-700' },
  blue:    { bg: 'bg-blue-100',    text: 'text-blue-600',    val: 'text-blue-700' },
  red:     { bg: 'bg-red-100',     text: 'text-red-600',     val: 'text-red-700' },
}

export function StatCard({ label, value, icon: Icon, color, subtitle, loading, compact }: StatCardProps) {
  const c = colorMap[color]
  return (
    <div className={cn(
      'bg-white rounded-xl border border-slate-200 shadow-sm',
      compact ? 'p-3.5' : 'p-4',
    )}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <div className={cn('rounded-lg flex items-center justify-center', c.bg, compact ? 'w-7 h-7' : 'w-9 h-9')}>
          <Icon size={compact ? 14 : 16} className={c.text} />
        </div>
      </div>
      {loading ? (
        <div className="h-6 w-12 bg-slate-100 rounded animate-pulse" />
      ) : (
        <p className={cn('font-bold', c.val, compact ? 'text-xl' : 'text-2xl')}>{value}</p>
      )}
      {subtitle && !loading && (
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</p>
      )}
    </div>
  )
}
