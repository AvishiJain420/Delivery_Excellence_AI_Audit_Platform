'use client'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useUIStore } from '@/store'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useUIStore()
  const sidebarW = sidebarCollapsed ? 64 : 240

  return (
    <div className="min-h-screen bg-slate-50" style={{ '--sidebar-w': `${sidebarW}px` } as React.CSSProperties}>
      <Sidebar />
      <Header />
      <main
        className={cn('transition-all duration-300 pt-14', sidebarCollapsed ? 'ml-16' : 'ml-60')}
      >
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  )
}
