'use client'

import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useUIStore } from '@/store'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useUIStore()

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <Header />

      <main
        className={cn(
          'min-h-screen pt-14 transition-all duration-300',
          sidebarCollapsed ? 'ml-16' : 'ml-60'
        )}
      >
        <div className="w-full p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}

