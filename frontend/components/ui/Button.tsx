import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none',
          // variants
          variant === 'primary'     && 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm',
          variant === 'secondary'   && 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300',
          variant === 'ghost'       && 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
          variant === 'outline'     && 'border border-slate-300 text-slate-700 hover:bg-slate-50 bg-white',
          variant === 'destructive' && 'bg-red-600 text-white hover:bg-red-700',
          // sizes
          size === 'sm'   && 'px-3 py-1.5 text-xs',
          size === 'md'   && 'px-4 py-2 text-sm',
          size === 'lg'   && 'px-5 py-2.5 text-sm',
          size === 'icon' && 'w-8 h-8 p-0',
          className,
        )}
        {...props}
      >
        {loading && (
          <span className="flex gap-0.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-current"
                style={{ animation: `dot-bounce 1.4s ease-in-out ${i * 0.16}s infinite` }}
              />
            ))}
          </span>
        )}
        {!loading && children}
      </button>
    )
  }
)
Button.displayName = 'Button'
