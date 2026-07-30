'use client'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FileSearch, History, BarChart3, Settings,
  ChevronLeft, ChevronRight, Bot, Code2, Shield, BookOpen, Sparkles,
} from 'lucide-react'
import { useUIStore } from '@/store'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/audit',     label: 'Live Audit',     icon: FileSearch },
  { href: '/history',   label: 'Audit History',  icon: History },
  { href: '/reports',   label: 'Reports',        icon: BarChart3 },
  { href: '/settings',  label: 'Settings',       icon: Settings },
]

const AGENT_ITEMS = [
  { label: 'Document Audit',    icon: FileSearch, active: true },
  { label: 'Code Audit',        icon: Code2,      active: false },
  { label: 'Compliance Review', icon: Shield,     active: false },
  { label: 'AI Assistant',      icon: Sparkles,   active: false },
  { label: 'Knowledge Base',    icon: BookOpen,   active: false },
]

export function Sidebar() {
  const pathname = usePathname()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  return (
    <aside className={cn(
      'fixed left-0 top-0 h-full z-30 flex flex-col transition-all duration-300 ease-in-out',
      'bg-gradient-to-b from-blue-950 to-blue-900',
      sidebarCollapsed ? 'w-16' : 'w-60',
    )}>
      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-white/10 transition-all duration-300 h-14',
        sidebarCollapsed ? 'px-4 justify-center' : 'px-5 gap-3',
      )}>
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
          <Bot size={18} className="text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="text-white font-bold text-sm tracking-tight">Polaris</p>
            <p className="text-blue-300/70 text-[10px]">Document Audit Platform</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {!sidebarCollapsed && (
          <p className="text-blue-400/60 text-[10px] font-semibold uppercase tracking-widest px-3 py-2">
            Navigation
          </p>
        )}
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link key={href} href={href} title={sidebarCollapsed ? label : undefined}
              className={cn('sidebar-item', active ? 'active' : 'inactive', sidebarCollapsed && 'justify-center px-0')}>
              <Icon size={17} className="flex-shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{label}</span>}
              {!sidebarCollapsed && active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
            </Link>
          )
        })}

        {!sidebarCollapsed && (
          <>
            <p className="text-blue-400/60 text-[10px] font-semibold uppercase tracking-widest px-3 pt-5 pb-2">
              Agent Ecosystem
            </p>
            {AGENT_ITEMS.map(({ label, icon: Icon, active }) => (
              <button key={label} disabled={!active} title={!active ? 'Coming soon' : undefined}
                className={cn('sidebar-item w-full text-left', active ? 'inactive' : 'opacity-40 cursor-not-allowed')}>
                <Icon size={15} className="flex-shrink-0" />
                <span className="truncate">{label}</span>
                {!active && <span className="ml-auto text-[9px] text-blue-400/60 font-medium">SOON</span>}
              </button>
            ))}
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 pb-4">
        <button onClick={toggleSidebar}
          className="w-full flex items-center justify-center py-2 rounded-lg text-blue-300/70 hover:text-white hover:bg-white/10 transition-all">
          {sidebarCollapsed
            ? <ChevronRight size={16} />
            : <span className="flex items-center gap-2 text-xs"><ChevronLeft size={14} />Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
