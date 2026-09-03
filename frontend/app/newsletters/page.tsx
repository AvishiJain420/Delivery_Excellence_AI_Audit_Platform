'use client'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/link'
import { Newspaper, Archive, ChevronRight } from 'lucide-react'

function ChoiceCard({
  icon: Icon,
  iconColor,
  title,
  description,
  href,
  btnLabel,
  btnColor,
}: {
  icon: React.ElementType
  iconColor: string
  title: string
  description: string
  href: string
  btnLabel: string
  btnColor: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col gap-3 flex-1 min-w-[280px] max-w-[400px] shadow-sm">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor}`}>
        <Icon size={20} />
      </div>
      <h3 className="text-[16px] font-semibold text-slate-900 m-0">{title}</h3>
      <p className="text-[13px] text-slate-500 leading-relaxed flex-1 m-0">{description}</p>
      <Link
        href={href}
        className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded text-[13px] font-semibold text-white transition-colors self-start ${btnColor}`}
      >
        {btnLabel} <ChevronRight size={13} />
      </Link>
    </div>
  )
}

export default function NewslettersPage() {
  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <span className="text-slate-600">Newsletters</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Newsletters</h1>
      <p className="text-[14px] text-slate-500 mb-7">
        Stay updated with the latest newsletters from the DEX Audit team
      </p>

      <div className="flex gap-5 flex-wrap">
        <ChoiceCard
          icon={Newspaper}
          iconColor="bg-blue-50 text-blue-600"
          title="Latest Newsletter"
          description="Read the most recent edition with audit stats, key highlights, and what's coming next."
          href="#"
          btnLabel="Read Now"
          btnColor="bg-rose-700 hover:bg-rose-800"
        />
        <ChoiceCard
          icon={Archive}
          iconColor="bg-blue-50 text-blue-600"
          title="Past Newsletters"
          description="Browse archived editions from previous months and download PDFs."
          href="/newsletters/past"
          btnLabel="Browse Archive"
          btnColor="bg-blue-600 hover:bg-blue-700"
        />
      </div>
    </AppShell>
  )
}
