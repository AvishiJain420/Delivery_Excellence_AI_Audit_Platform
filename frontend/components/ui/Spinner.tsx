import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'sm', className }: SpinnerProps) {
  return (
    <svg
      className={cn(
        'animate-spin text-blue-600',
        size === 'xs' && 'w-3 h-3',
        size === 'sm' && 'w-4 h-4',
        size === 'md' && 'w-5 h-5',
        size === 'lg' && 'w-7 h-7',
        className,
      )}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn('flex gap-1 items-center', className)}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-blue-500"
          style={{ animation: `dot-bounce 1.4s ease-in-out ${i * 0.16}s infinite` }}
        />
      ))}
    </span>
  )
}
