'use client'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/dist/client/link'
import { FileText, FolderOpen, ChevronRight, BookMarked, Lightbulb } from 'lucide-react'
import { docLink } from '@/lib/config'

function ActionCard({ icon: Icon, iconBg, title, description, href,target,rel, btnLabel }: {
  icon: React.ElementType; iconBg: string; title: string
  description: string; href: string; target: string; rel: string; btnLabel: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-5 shadow-sm hover:shadow transition-shadow">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-semibold text-slate-800">{title}</h3>
        <p className="text-[13px] text-slate-500 mt-0.5">{description}</p>
      </div>
      <Link href={href} target="_blank" rel="noopener noreferrer"
        className="w-44 flex-shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors">
        {btnLabel} <ChevronRight size={13} />
      </Link>
    </div>
  )
}

export default function DexStarPage() {
  return (
    <AppShell>
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <span className="text-slate-600">DEX &amp; STAR Documents</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">DEX &amp; STAR Documents</h1>
      <p className="text-[14px] text-slate-500 mb-7 max-w-2xl">
        Reference materials, standard practices, and sample documents for DEX and STAR audits.
        Use these resources to ensure audit-ready submissions and maintain consistent delivery standards.
      </p>

      <div className="flex flex-col gap-4 max-w-5xl">
        <ActionCard
          icon={Lightbulb}
          iconBg="bg-blue-50 text-blue-600"
          title="Standard Practices"
          description="Standardised guidelines, checklists, and process documentation for DEX and STAR audit submissions."
          href={docLink('standardPractices')}
          target="_blank" 
          rel="noopener noreferrer"
          btnLabel="View Practices"
        />
        <ActionCard
          icon={FolderOpen}
          iconBg="bg-blue-50 text-blue-700"
          title="Sample Documents"
          description="Reference documents, templates, and sample project artefacts to guide your audit preparation."
          href={docLink('sampleDocuments')}
          target="_blank"
          rel="noopener noreferrer"
          btnLabel="Browse Samples"
        />
      </div>
    </AppShell>
  )
}