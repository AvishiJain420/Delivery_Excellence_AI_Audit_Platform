'use client'
import { AppShell } from '@/components/layout/AppShell'
import { useCurrentUser } from '@/hooks'
import { useDashboardStats } from '@/hooks'
import Link from 'next/dist/client/link'
import {
  FileText, CheckCircle2, Play, XCircle,
  BookOpen, FileSearch, ClipboardList, ChevronRight, Users,
} from 'lucide-react'
import { StatCard } from '@/components/dashboard/StatCard'

// ── Section panel (simplified — click to navigate to dedicated page) ──────────
function SectionPanel({
  emoji, title, description, href,
  border = 'border-blue-200', bg = 'bg-blue-50', text = 'text-blue-900',
}: {
  emoji: string; title: string; description: string; href: string
  border?: string; bg?: string; text?: string
}) {
  return (
    <Link href={href} className="group flex-1 min-w-[260px]">
      <div className="bg-white border border-slate-200 rounded-xl p-6 h-full flex flex-col gap-4 shadow-sm
                      hover:shadow-md hover:border-blue-300 transition-all cursor-pointer">
        {/* Tag */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-semibold self-start ${bg} ${text} border ${border}`}>
          <span>{emoji}</span>
          {title}
        </div>
        {/* Description */}
        <p className="text-[13.5px] text-slate-500 leading-relaxed flex-1">{description}</p>
        {/* Explore link */}
        <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-600 group-hover:gap-2.5 transition-all">
          Explore <ChevronRight size={14} />
        </div>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const { data: user } = useCurrentUser()
  // const firstName = user?.name?.split(' ')[0] ?? 'there'
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const displayStats = stats ?? { total: 0, completed: 0, running: 0, failed: 0, pending: 0 }

  return (
    <AppShell>
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Hello there!</h1>
        <p className="text-[14px] text-slate-500 max-w-2xl leading-relaxed">
          Welcome to Polaris, your one-stop solution for simplifying audits, strengthening governance,
          and enabling consistent project delivery.
        </p>
      </div>

      {/* ── Audit Status KPI cards (compact) ─────────────────────────────────── */}
      <div className="mb-7">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2.5">
          Audit Status
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Audits"  value={displayStats.total}     icon={FileText}     color="slate"   loading={statsLoading} compact />
          <StatCard label="Completed"     value={displayStats.completed} icon={CheckCircle2} color="emerald" loading={statsLoading} compact
            subtitle={`${displayStats.total ? Math.round((displayStats.completed / displayStats.total) * 100) : 0}% success rate`} />
          <StatCard label="Running"       value={displayStats.running}   icon={Play}         color="blue"    loading={statsLoading} compact
            subtitle="Currently active" />
          <StatCard label="Failed"        value={displayStats.failed}    icon={XCircle}      color="red"     loading={statsLoading} compact />
        </div>
      </div>

      {/* ── Three section panels (click → dedicated pages) ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        <SectionPanel
          emoji="📚"
          title="Knowledge Library"
          description="Access newsletters, DEX &amp; STAR knowledge documentation, and leadership summaries to stay informed on best practices."
          href="/knowledge-library"
          border="border-blue-200"
          bg="bg-blue-50"
          text="text-blue-900"
        />
        <SectionPanel
          emoji="📄"
          title="DEX &amp; STAR Documents"
          description="Browse standard practices, reference materials, and sample project documents to prepare for your next audit submission."
          href="/dex-star"
          border="border-sky-200"
          bg="bg-sky-50"
          text="text-sky-900"
        />
        <SectionPanel
          emoji="📋"
          title="Audit"
          description="Initiate STAR or DEX audits, review open audits as an auditor, view history, and manage audit schedules."
          href="/audit"
          border="border-blue-300"
          bg="bg-blue-100"
          text="text-blue-900"
        />
      </div>

      {/* Contact */}
      <div className="flex justify-end pr-0.5">
        <a href="mailto:dex@procdna.com?subject=I Have a Query"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg shadow-sm transition-colors">
          <Users size={14} /> Contact Us
        </a>
      </div>
    </AppShell>
  )
}