'use client'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/link'
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { docLink } from '@/lib/config'

export default function InitiateAuditPage() {
  const [acknowledged, setAcknowledged] = useState(false)
  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <span className="text-slate-600">Initiate New Audit</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Initiate New Project Audit</h1>
      <p className="text-[14px] text-slate-500 mb-7">Choose the type of audit you would like to initiate</p>

      <div className="mb-8 rounded-lg bg-blue-100 border border-slate-200 p-5">
        <h2 className="text-[16px] font-semibold text-slate-900 mb-3">
          Instructions
        </h2>

        <ol className="list-decimal list-inside space-y-2 text-[14px] text-slate-600">
          <li>Initiate the audit request early. Reach out as soon as the project is confirmed.</li>
          <li>Keep all the required documents prepared for SharePoint before the audit.</li>
          <li>Go through the AI audit once you have submitted the details form.</li>
          <li>Don't upload DEX documents for a STAR audit and vice versa or else scoring accuracy may be affected.</li>
          <li>Upload only the documents that are present in the DEx and STAR documents checklist. <a href={docLink('docChecklist')} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            Click here
          </a>{' '} for the same.</li>
          <li>Make sure not to upload more than 10 documents at a time for an audit.</li>
          <li>Don't initiate an audit unless all the details are confirmed.</li>
        </ol>

        <label className="mt-5 flex items-center gap-2 cursor-pointer text-[14px] text-slate-700">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="h-4 w-4"
          />
          <span>I acknowledge all the instructions given above.</span>
        </label>
      </div>

      <div className="flex gap-5 flex-wrap">
        {/* STAR */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col gap-3 flex-1 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-xl">
            🏆
          </div>
          <h3 className="text-[16px] font-semibold text-slate-900 m-0">STAR Audit</h3>
          <p className="text-[12.5px] font-semibold text-blue-600 -mt-1">
            Scoping and Technical Architecture Review
          </p>
          <p className="text-[13px] text-slate-500 leading-relaxed flex-1 m-0">
            Recommended for technology projects led by AEL+ at the pre-sales/SOW stage to ensure
            delivery quality and process standards.
            Please ensure that the latest rate card is used for the document.
          </p>
          {acknowledged && (
            <Link
              href="/audit/initiate/star"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-900 hover:bg-blue-950 text-white text-[13px] font-semibold rounded transition-colors self-start"
            >
              Start STAR Audit <ChevronRight size={13} />
            </Link>
          )}
        </div>

        {/* DEX */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col gap-3 flex-1 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center text-xl">
            💎
          </div>
          <h3 className="text-[16px] font-semibold text-slate-900 m-0">DEX Audit</h3>
          <p className="text-[12.5px] font-semibold text-purple-600 -mt-1">
            Delivery Excellence
          </p>
          <p className="text-[13px] text-slate-500 leading-relaxed flex-1 m-0">
            Recommended for projects seeking architecture and scope approval during the initial phase.
          </p>
          {acknowledged && (
            <Link
              href="/audit/initiate/dex"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded transition-colors self-start"
            >
              Start DEX Audit <ChevronRight size={13} />
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  )
}