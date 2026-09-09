'use client'
import { cn } from '@/lib/utils'
import Link from 'next/dist/client/link'
import { usePathname } from 'next/navigation'
import {
  History, ChevronLeft, ChevronRight, Bot,
  Home, BookOpen, Newspaper, FileText, ClipboardList,
  ChevronDown, ChevronUp, FolderOpen, Users, Lightbulb, Library,
} from 'lucide-react'
import { useUIStore } from '@/store'
import { useState } from 'react'
import { docLink } from '@/lib/config'

type NavLeaf  = { href: string; label: string; icon: React.ElementType , target?: string , rel?: string}
type NavGroup = { groupLabel: string; icon: React.ElementType; href?: string; children: NavLeaf[] }
type NavItem  = NavLeaf | NavGroup

const isGroup = (i: NavItem): i is NavGroup => 'groupLabel' in i

const NAV: NavItem[] = [
  { href: '/home', label: 'Home', icon: Home },

  // Knowledge Library — expandable group with dedicated page
  {
    groupLabel: 'Knowledge Library',
    icon: BookOpen,
    href: '/knowledge-library',
    children: [
      { href: '/newsletters',label: 'Newsletters',icon: Newspaper },
      { href: docLink('dexStarKnowledge'),label: 'DEX & STAR Knowledge', icon: Library ,target: '_blank', rel: 'noopener noreferrer'},
      { href: docLink('leadershipSummary'),label: 'Leadership Summary', icon: Users , target: '_blank', rel: 'noopener noreferrer'},
    ],
  },

  // DEX and STAR Documents — expandable
  {
    groupLabel: 'DEX & STAR Docs',
    icon: Library,
    href: '/dex-star',
    children: [
      { href: docLink('standardPractices'), label: 'Standard Practices', icon: Lightbulb ,target: '_blank', rel: 'noopener noreferrer'},
      { href: docLink('sampleDocuments'),   label: 'Sample Documents',   icon: FolderOpen ,target: '_blank', rel: 'noopener noreferrer'},
    ],
  },

  // Audit — expandable; clicking label goes to /audit
  {
    groupLabel: 'Audit',
    icon: ClipboardList,
    href: '/audit',
    children: [
      { href: '/audit/process',   label: 'Audit Process',         icon: FileText },
      { href: '/ai-history',      label: 'Documents Audit History',      icon: History },
      { href: '/overall-history', label: 'Project Audit History', icon: History },
    ],
  },
]

export function Sidebar() {
  const pathname   = usePathname()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(['Knowledge Library', 'Audit'])
  )

  const toggle = (label: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n })

  const active = (href: string) =>
    pathname === href || (href !== '/home' && href !== '/dashboard' && pathname.startsWith(href))

  return (
    <aside className={cn(
      'fixed left-0 top-0 h-full z-30 flex flex-col transition-all duration-300 ease-in-out',
      'bg-gradient-to-b from-blue-950 to-blue-900',
      sidebarCollapsed ? 'w-16' : 'w-60',
    )}>
      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-white/10 h-14 flex-shrink-0 transition-all duration-300',
        sidebarCollapsed ? 'px-4 justify-center' : 'px-5 gap-3',
      )}>
        <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
          <Bot size={18} className="text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="text-white font-bold text-sm tracking-tight">Polaris</p>
            <p className="text-blue-300/70 text-[10px]">Delivery Excellence</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {!sidebarCollapsed && (
          <p className="text-blue-400/60 text-[10px] font-semibold uppercase tracking-widest px-3 py-2">Navigation</p>
        )}

        {NAV.map(item => {
          if (!isGroup(item)) {
            const isAct = active(item.href)
            const Icon  = item.icon
            return (
              <Link key={item.href} href={item.href} target={item.target} rel={item.rel}
                title={sidebarCollapsed ? item.label : undefined}
                className={cn('sidebar-item', isAct ? 'active' : 'inactive', sidebarCollapsed && 'justify-center px-0')}>
                <Icon size={17} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {!sidebarCollapsed && isAct && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
              </Link>
            )
          }

          const GroupIcon = item.icon
          const isOpened  = open.has(item.groupLabel)
          const anyActive = item.children.some(c => active(c.href)) || (item.href ? active(item.href) : false)

          if (sidebarCollapsed) {
            return item.children.map(child => {
              const CIcon = child.icon
              const isAct = active(child.href)
              return (
                <Link key={child.href} href={child.href} title={child.label} target={child.target} rel={child.rel}
                  className={cn('sidebar-item justify-center px-0', isAct ? 'active' : 'inactive')}>
                  <CIcon size={17} className="flex-shrink-0" />
                </Link>
              )
            })
          }

          return (
            <div key={item.groupLabel}>
              <div className="flex items-center gap-0.5">
                {/* Clicking the label navigates if href is set */}
                {item.href ? (
                  <Link href={item.href} 
                    className={cn('sidebar-item flex-1', anyActive ? 'active' : 'inactive')}>
                    <GroupIcon size={17} className="flex-shrink-0" />
                    <span className="truncate">{item.groupLabel}</span>
                    {anyActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
                  </Link>
                ) : (
                  <button onClick={() => toggle(item.groupLabel)}
                    className={cn('sidebar-item flex-1 w-full text-left', anyActive ? 'text-white' : 'inactive')}>
                    <GroupIcon size={17} className="flex-shrink-0" />
                    <span className="truncate flex-1">{item.groupLabel}</span>
                  </button>
                )}

                {/* Chevron toggle */}
                <button type="button" onClick={() => toggle(item.groupLabel)}
                  className="p-1.5 text-blue-200/60 hover:text-white transition-colors">
                  {isOpened
                    ? <ChevronUp size={13} />
                    : <ChevronDown size={13} />}
                </button>
              </div>

              {isOpened && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                  {item.children.map(child => {
                    const CIcon = child.icon
                    const isAct = active(child.href)
                    return (
                      <Link key={child.href} href={child.href} target = {child.target} rel={child.rel}
                        className={cn('sidebar-item text-[12px]', isAct ? 'active' : 'inactive')}>
                        <CIcon size={14} className="flex-shrink-0" />
                        <span className="truncate">{child.label}</span>
                        {isAct && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Collapse */}
      <div className="px-2 pb-4 flex-shrink-0">
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
 