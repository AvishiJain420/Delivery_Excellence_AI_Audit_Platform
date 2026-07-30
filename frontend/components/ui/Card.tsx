import { cn } from '@/lib/utils'

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 shadow-sm', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4 border-b border-slate-100', className)}>{children}</div>
}

export function CardTitle({ className, children }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold text-slate-800', className)}>{children}</h3>
}

export function CardContent({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)}>{children}</div>
}
