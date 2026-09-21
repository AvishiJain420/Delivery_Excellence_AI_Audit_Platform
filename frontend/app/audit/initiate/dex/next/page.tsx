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

          <div className="text-left text-[15px] text-slate-600 leading-7 mb-8">
            <h2 className="font-semibold text-slate-800 mb-3">
              Instructions
            </h2>

            <ol className="list-decimal list-inside space-y-2">
              <li>The completion of AI review is mandatory for an audit to be considered as completed.</li>
              <li>Make sure you validate all your documents before the AI evaluation begins since you won't be able to make changes later.</li>
              <li>Manual audit will only start once the AI review is completed.</li>
              <li>Do not leave the AI audit page unless the audit report is generated.</li>
            </ol>
          </div>

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