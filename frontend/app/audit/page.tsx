'use client'
import React from 'react'
import Link from 'next/dist/client/link'
import { AppShell } from '@/components/layout/AppShell'
import { useCurrentUser } from '@/hooks'
import {
  FileText, History, PlaySquare, PlusCircle,
  Calendar, FileCheck, ChevronRight,
} from 'lucide-react'

interface AuditOption {
  id: string
  description: string
  buttonText: string
  href: string
  target?: string
  rel?: string
  icon: React.ElementType
  // 'all' = everyone | 'admin_auditor' = admin or auditor only
  visibility: 'all' | 'admin_auditor'
}

const AUDIT_OPTIONS: AuditOption[] = [
  {
    id: 'audit-process',
    description: 'How the audit is conducted ?',
    buttonText: 'Audit Process',
    href: '/audit/process',
    icon: FileText,
    visibility: 'all',
  },
  {
    id: 'initiate-request',
    description: 'Fill and submit DEX or STAR form to initiate an audit request',
    buttonText: 'Initiate Audit Request',
    href: '/audit/initiate',
    icon: PlusCircle,
    visibility: 'all',
  },
  {
    id: 'overall-history',
    description: 'Review all DEX & STAR end-to-end Project Audits',
    buttonText: 'Project Audit History',
    href: '/overall-history',
    icon: History,
    visibility: 'all',
  },
  {
    id: 'doc-ai-history',
    description: 'Review all document audits initiated under the DEX or STAR Project Audits',
    buttonText: 'Documents Audit History',
    href: '/ai-history',
    icon: FileCheck,
    visibility: 'all',
  },
  {
    id: 'audit-schedule',
    description: 'View calendar of planned audits/events by the Polaris Team',
    buttonText: 'Audit Schedule',
    href: process.env.NEXT_PUBLIC_AUDIT_SCHEDULE_URL!,
    target: '_blank',
    rel: 'noopener noreferrer',
    icon: Calendar,
    visibility: 'all',
  },
  {
    id: 'start-audit',
    description: 'Begin review for an open or new audit',
    buttonText: 'Start Audit',
    href: '/audit/start',
    icon: PlaySquare,
    visibility: 'admin_auditor',   // hidden from regular users
  },
]

export default function AuditPage() {
  const { data: currentUser } = useCurrentUser()
  const isAdminOrAuditor =
    currentUser?.role === 'admin' || currentUser?.role === 'auditor'
  console.log('CURRENT USER:', currentUser)
  console.log('IS ADMIN/AUDITOR:', isAdminOrAuditor)
  const visibleOptions = AUDIT_OPTIONS.filter(opt => {
    if (opt.visibility === 'all') return true
    if (opt.visibility === 'admin_auditor') return isAdminOrAuditor
    return false
  })

  return (
    <AppShell>
      <div className="w-full">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
          <Link href="/home" className="hover:text-blue-600 transition-colors">Home</Link>
          <ChevronRight size={12} />
          <span className="text-slate-600 font-medium">Audit</span>
        </nav>

        <h1 className="text-2xl font-bold text-slate-900 mb-7">Audit</h1>

        {/* Action cards — all buttons same width (w-52) */}
        <div className="w-full bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {visibleOptions.map((opt) => {
            const Icon = opt.icon
            return (
              <div
                key={opt.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-5 hover:bg-slate-50/50 transition-colors"
              >
                {/* Icon + description */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Icon size={20} />
                  </div>
                  <p className="text-[14px] text-slate-700 font-medium leading-snug">
                    {opt.description}
                  </p>
                </div>

                {/* Button — fixed width so all are the same */}
                <Link
                  href={opt.href}
                  target={opt.target}
                  rel={opt.rel}
                  className="flex-shrink-0 w-52 px-4 py-2 text-[13px] font-semibold text-white border border-blue-200 rounded-lg bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors text-center"
                >
                  {opt.buttonText}
               </Link>
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}