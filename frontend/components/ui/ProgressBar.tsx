import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number          // 0–100
  indeterminate?: boolean
  size?: 'xs' | 'sm' | 'md'
  color?: 'blue' | 'emerald' | 'amber' | 'red'
  className?: string
  showLabel?: boolean
}

export function ProgressBar({
  value,
  indeterminate,
  size = 'sm',
  color = 'blue',
  className,
  showLabel,
}: ProgressBarProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn(
        'flex-1 rounded-full overflow-hidden bg-slate-100',
        size === 'xs' && 'h-1',
        size === 'sm' && 'h-1.5',
        size === 'md' && 'h-2.5',
      )}>
        {indeterminate ? (
          <div className={cn(
            'h-full w-full progress-indeterminate',
            color === 'blue'    && '[--bar-color:#3b82f6]',
            color === 'emerald' && '[--bar-color:#10b981]',
          )} />
        ) : (
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              color === 'blue'    && 'bg-blue-500',
              color === 'emerald' && 'bg-emerald-500',
              color === 'amber'   && 'bg-amber-500',
              color === 'red'     && 'bg-red-500',
            )}
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          />
        )}
      </div>
      {showLabel && !indeterminate && (
        <span className="text-xs font-medium text-slate-500 w-8 text-right">{Math.round(value)}%</span>
      )}
    </div>
  )
}
