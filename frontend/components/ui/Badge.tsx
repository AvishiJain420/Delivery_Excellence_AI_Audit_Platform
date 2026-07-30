import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'running' | 'completed' | 'failed' | 'queued' | 'pending' | 'outline'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
      variant === 'default'   && 'bg-slate-100 text-slate-700 border-slate-200',
      variant === 'running'   && 'badge-running',
      variant === 'completed' && 'badge-completed',
      variant === 'failed'    && 'badge-failed',
      variant === 'queued'    && 'badge-queued',
      variant === 'pending'   && 'badge-pending',
      variant === 'outline'   && 'bg-transparent text-slate-600 border-slate-300',
      className,
    )}>
      {children}
    </span>
  )
}
