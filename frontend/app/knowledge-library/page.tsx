'use client'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/dist/client/link'
import { Newspaper, BookOpen, Users, ChevronRight } from 'lucide-react'

function ActionCard({ icon: Icon, iconBg, title, description, href, btnLabel }: {
  icon: React.ElementType; iconBg: string; title: string
  description: string; href: string; btnLabel: string
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
      <Link href={href}
        className="w-44 flex-shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors">
        {btnLabel} <ChevronRight size={13} />
      </Link>
    </div>
  )
}

export default function KnowledgeLibraryPage() {
  return (
    <AppShell>
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <span className="text-slate-600">Knowledge Library</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Knowledge Library</h1>
      <p className="text-[14px] text-slate-500 mb-7 max-w-2xl">
        Your central repository for newsletters, DEX &amp; STAR knowledge documentation, and
        leadership summaries. Stay informed on best practices and the latest updates.
      </p>

      <div className="flex flex-col gap-4 max-w-5xl">
        <ActionCard
          icon={Newspaper}
          iconBg="bg-blue-50 text-blue-600"
          title="Newsletters"
          description="Stay updated with the latest newsletters, audit stats, and key highlights from the DEX Audit team."
          href="/newsletters"
          btnLabel="View Newsletters"
        />
        <ActionCard
          icon={BookOpen}
          iconBg="bg-blue-50 text-blue-700"
          title="DEX & STAR Knowledge"
          description="Access DEX and STAR-specific documentation, guidance, and audit preparation resources."
          href="/dex-star"
          btnLabel="Open Library"
        />
        <ActionCard
          icon={Users}
          iconBg="bg-blue-50 text-blue-800"
          title="Leadership Summary"
          description="Executive-level summaries, steering committee updates, and governance overviews."
          href="#"
          btnLabel="View Summary"
        />
      </div>
    </AppShell>
  )
}