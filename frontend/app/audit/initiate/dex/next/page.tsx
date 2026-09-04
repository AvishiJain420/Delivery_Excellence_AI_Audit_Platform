'use client'

import { AppShell } from '@/components/layout/AppShell'
import { useSearchParams } from 'next/navigation'

export default function DexNextPage() {
  const searchParams = useSearchParams()

  const sessionId = searchParams.get('session_id')

  const reviewUrl = sessionId
    ? `/ai-audit?id=${encodeURIComponent(sessionId)}`
    : '#'

  return (
    <AppShell>
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center max-w-2xl px-8 py-10 bg-blue-50 border border-blue-100 rounded-xl">

          <h1 className="text-2xl font-semibold text-slate-900 mb-4">
            Your Audit Request has been Submitted!
          </h1>

          <p className="text-[15px] text-slate-600 leading-7 mb-8">
            Storing your responses will take 1-2 mins. After that click
            {' '}
            <span className="font-semibold text-slate-800">
              "Get AI Review"
            </span>
            {' '}
            to view your audit.
          </p>

          <a
            //type="button"
            href={reviewUrl}
            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold rounded-lg transition-colors"
          >
            Get AI Review
          </a>

        </div>
      </div>
    </AppShell>
  )
}