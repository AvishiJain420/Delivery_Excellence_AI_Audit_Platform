'use client'

import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

function ArticleCard({
  icon,
  iconColor,
  title,
  description,
  href,
  btnColor,
  btnLabel = 'Read Now',
}: {
  icon: string
  iconColor: string
  title: string
  description: string
  href: string
  btnColor: string
  btnLabel?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col gap-3 shadow-sm w-full min-w-0">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${iconColor}`}
      >
        {icon}
      </div>

      <h4 className="text-[15px] font-semibold text-slate-800 m-0">
        {title}
      </h4>

      <p className="text-[13px] text-slate-500 leading-relaxed flex-1 m-0">
        {description}
      </p>

      <a
        href={href}
        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-[13px] font-semibold text-white transition-colors self-start ${btnColor}`}
      >
        {btnLabel}
        <ChevronRight size={13} />
      </a>
    </div>
  )
}

export default function AuditProcessPage() {
  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <span className="text-slate-600">Audit Process</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Audit Process</h1>
      <p className="text-[14px] text-slate-500 mb-6">
        Everything you need to understand and prepare for an audit
      </p>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 flex gap-3 items-start mb-7 max-w-3.75xl">
        <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5">
          i
        </div>
        <div>
          <strong className="text-blue-700 text-[14px] block mb-1">How does the audit work?</strong>
          <p className="text-[13px] text-slate-600 leading-relaxed m-0">
            The DEX Audit is a structured review of your project's data, quality, and governance artefacts.
            All documents are first AI-reviewed for completeness, then assessed by a DEX Auditor.
            Projects scoring above 5/10 are eligible to proceed to formal audit review.
          </p>
        </div>
      </div>

      {/* Article cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
        <ArticleCard
          icon="📰"
          iconColor="bg-rose-50 text-rose-700"
          title="Audit Overview & Introduction"
          description="What the DEX Audit is, why it matters, and who is involved"
          href={process.env.NEXT_PUBLIC_AUDIT_OVERVIEW_URL!}
          btnColor="bg-rose-700 hover:bg-rose-800"
        />

        <ArticleCard
          icon="📋"
          iconColor="bg-blue-50 text-blue-700"
          title="Pre-requisites Checklist"
          description="Documents and artefacts required before requesting an audit"
          href={process.env.NEXT_PUBLIC_PREREQUISITES_URL!}
          btnColor="bg-blue-600 hover:bg-blue-700"
        />

        <ArticleCard
          icon="⚙️"
          iconColor="bg-green-50 text-green-700"
          title="Scoring Rubric"
          description="How scores are calculated across different metrics"
          href={process.env.NEXT_PUBLIC_SCORING_RUBRIC_URL!}
          btnColor="bg-green-700 hover:bg-green-800"
        />
      </div>

      {/* Process steps */}
      <div className="mt-8 max-w-3.75xl">
        <h2 className="text-[16px] font-semibold text-slate-800 mb-4">Audit Steps</h2>
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm divide-y divide-slate-100">
          {[
            { step: '01', title: 'Submit Audit Request', desc: 'Initiate a STAR or DEX audit via the Initiate Audit form, attaching all required project documents.' },
            { step: '02', title: 'AI Document Review', desc: 'The Polaris AI pipeline automatically analyses all uploaded documents against the audit framework, producing an AI score and summary.' },
            { step: '03', title: 'Auditor Review', desc: 'A DEX Auditor reviews the project details, AI scores, and documents, then uploads their findings and overall score.' },
            { step: '04', title: 'Results & Report', desc: 'The final audit report is generated and stored. You can view scores, findings, and download the full report from Audit History.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-4 px-5 py-4">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[12px] font-bold flex-shrink-0">
                {step}
              </div>
              <div>
                <p className="text-[13.5px] font-semibold text-slate-800 mb-0.5">{title}</p>
                <p className="text-[12.5px] text-slate-500 leading-relaxed m-0">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-6">
        <Link
          href="/audit/initiate"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold rounded-lg transition-colors"
        >
          Initiate an Audit <ChevronRight size={14} />
        </Link>
      </div>
    </AppShell>
  )
}