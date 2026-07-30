'use client'
import { Bell, Search, ChevronDown, LogOut } from 'lucide-react'
import { useUIStore, useAuditStore } from '@/store'
import { useCurrentUser } from '@/hooks'
import { authApi } from '@/services/api'
import { cn } from '@/lib/utils'
import { useState } from 'react'

export function Header() {
  const { sidebarCollapsed } = useUIStore()
  const { isConnected } = useAuditStore()
  const { data: user } = useCurrentUser()
  const [profileOpen, setProfileOpen] = useState(false)

  const initials = user?.user_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <header className={cn(
      'fixed top-0 right-0 z-20 flex items-center h-14 px-4 gap-3',
      'bg-white border-b border-slate-200 shadow-sm transition-all duration-300',
      sidebarCollapsed ? 'left-16' : 'left-60',
    )}>
      {/* Search */}
      <div className="flex-1 max-w-xs md:max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
          <input type="text" placeholder="Search audits…"
            className="w-full pl-8 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* WS connection indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
          <span className={cn('w-1.5 h-1.5 rounded-full', isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300')} />
          <span className="text-xs text-slate-500 font-medium">{isConnected ? 'Live' : 'Offline'}</span>
        </div>

        {/* Notifications placeholder */}
        <button className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <Bell size={17} />
        </button>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(p => !p)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-slate-700 leading-tight">{user?.user_name ?? 'Loading…'}</p>
              <p className="text-[10px] text-slate-400 leading-tight">{user?.azure_email ?? ''}</p>
            </div>
            <ChevronDown size={12} className="text-slate-400" />
          </button>

          {profileOpen && (
            <div className="absolute top-full right-0 mt-2 w-52 bg-white rounded-xl border border-slate-200 shadow-xl z-50">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-800">{user?.user_name}</p>
                <p className="text-xs text-slate-400">{user?.azure_email}</p>
              </div>
              <button
                onClick={authApi.logout}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors rounded-b-xl"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
