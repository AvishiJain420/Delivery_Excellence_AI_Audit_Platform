'use client'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/link'
import { FileText, ExternalLink } from 'lucide-react'

// In a real implementation these would be fetched from the API
const MOCK_NEWSLETTERS = [
  { id: 1, title: 'Delivery Excellence Newsletter — Edition 1', date: 'January 2026', url: '#' },
  { id: 2, title: 'Delivery Excellence Newsletter — Edition 2', date: 'February 2026', url: '#' },
  { id: 3, title: 'Delivery Excellence Newsletter — Edition 3', date: 'March 2026', url: '#' },
  { id: 4, title: 'Delivery Excellence Newsletter — Edition 4', date: 'April 2026', url: '#' },
  { id: 5, title: 'Delivery Excellence Newsletter — Edition 5', date: 'May 2026', url: '#' },
]

export default function PastNewslettersPage() {
  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <Link href="/newsletters" className="hover:text-blue-600">Newsletters</Link>
        <span>›</span>
        <span className="text-slate-600">Past Newsletters</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Past Newsletters</h1>
      <p className="text-[14px] text-slate-500 mb-6">Archived editions from previous months</p>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm max-w-3xl">
        {MOCK_NEWSLETTERS.map((nl, idx) => (
          <div
            key={nl.id}
            className={`flex items-center justify-between px-5 py-4 gap-4 ${
              idx < MOCK_NEWSLETTERS.length - 1 ? 'border-b border-slate-100' : ''
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileText size={15} className="text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-slate-800 truncate">{nl.title}</p>
                <p className="text-[11.5px] text-slate-400">{nl.date}</p>
              </div>
            </div>
            <a
              href={nl.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-semibold text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors flex-shrink-0"
            >
              View <ExternalLink size={11} />
            </a>
          </div>
        ))}
      </div>
    </AppShell>
  )
}
