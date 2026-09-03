'use client'
/**
 * app/ai-audit/page.tsx
 *
 * WHERE THIS FILE LIVES: frontend/app/ai-audit/page.tsx
 *
 * The main audit running page. Rendered at /audit?id=SESSION_ID
 *
 * Layout (responsive):
 *   Full-bleed (no AppShell padding) so the three-panel layout fills the screen.
 *   Top bar → Timeline → [Left 70% chat | Right 30% queue/log]
 *
 * Real-time behaviour:
 *   - useAuditSession connects the WebSocket
 *   - Store updates drive all UI changes
 *   - ValidationModal appears when backend needs user approval
 *   - Done state shows report download link
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { AppShell } from '@/components/layout/AppShell'
import { AuditTimeline } from '@/components/audit/AuditTimeline'
import { ChatMessageCard } from '@/components/audit/ChatMessageCard'
import { DocumentQueue } from '@/components/audit/DocumentQueue'
import { LiveLog } from '@/components/audit/LiveLog'
import { ValidationModal } from '@/components/audit/ValidationModal'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { LoadingDots } from '@/components/ui/Spinner'
import { useAuditStore } from '@/store'
import { useAuditSession } from '@/hooks'
import { formatRelativeTime } from '@/lib/utils'
import {
  FileText, AlertTriangle, Clock, ArrowLeft, Download,
  CheckCircle2, ExternalLink,LayoutDashboard , Globe
} from 'lucide-react'
import Link from 'next/link'
import { auditApi } from '@/services/api'
import {config} from '@/lib/config'
import { useState, useEffect, useRef } from 'react'


function AuditPageInner() {
  const params = useSearchParams()

  const [sessionId, setSessionId] = useState<string | null>(params.get("id"))

  const itemId = params.get("item_id")

  const [startError, setStartError] = useState<string | null>(null)
  const startedRef = useRef(false)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    if (startedRef.current) return
    if (sessionId || !itemId) return

    startedRef.current = true

    const powerAppItemId = itemId

    async function startPowerAppAudit() {
      try {
        const response = await auditApi.startFromPowerApp(powerAppItemId)

        initSession(
          response.session_id,
          response.project_name
            ? `${response.project_name} — ${response.audit_type ?? 'Audit'}`
            : 'Loading audit…',
          response.project_name ?? '',
          response.client_name ?? '',
          response.audit_type ?? '',
        )

        setSessionId(response.session_id)
      } catch (error) {
        console.error('Failed to start Power Apps audit:', error)
        setStartError(
          error instanceof Error
            ? error.message
            : 'Failed to start the audit'
        )
        startedRef.current = false
      }
    }

    startPowerAppAudit()
  }, [sessionId, itemId])

  const [activeTab, setActiveTab] = useState<'queue' | 'log'>('queue')

  const { session, chatMessages, liveLog, isConnected ,initSession ,frameworkCategories} = useAuditStore()
  const { pendingValidation, handleValidationConfirm } = useAuditSession(sessionId)

  const overallProgress = session?.overallProgress ?? 0
  const isDone = session?.status === 'done'
  const isFailed = session?.status === 'failed'

  const handleExportReport = async () => {
    if (!sessionId || isDownloading) {
      return
    }

    try {
      setIsDownloading(true)

      const {
        blob,
        fileName,
      } = await auditApi.downloadReport(
        sessionId
      )

      const objectUrl = (
        window.URL.createObjectURL(
          blob
        )
      )

      const downloadLink = (
        document.createElement("a")
      )

      downloadLink.href = objectUrl

      downloadLink.download = fileName

      document.body.appendChild(
        downloadLink
      )

      downloadLink.click()

      downloadLink.remove()

      window.URL.revokeObjectURL(
        objectUrl
      )

    } catch (error) {
      console.error(
        "Failed to export report:",
        error
      )

      alert(
        error instanceof Error
          ? error.message
          : "Failed to download report"
      )

    } finally {
      setIsDownloading(false)
    }
  }

  if (!sessionId) {

    if (startError) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50">
          <div className="text-center">
            <p className="text-red-600 font-semibold">
              Failed to start audit
            </p>
            <p className="text-sm text-slate-500 mt-2">
              {startError}
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col h-screen items-center justify-center bg-slate-50">
        <LoadingDots />
        <p className="mt-3 text-sm text-slate-600">
          Starting audit from Power Apps...
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-white h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 shadow-sm">
        <div className="flex items-center gap-3">
          {!itemId && (
            <Link href="/home">
              <ArrowLeft size={16} />
          </Link>
          )}
          
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <FileText size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 truncate">
                  {session?.name ?? 'Loading audit…'}
                </h1>
                </div>

              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {isDone ? (
                  <Badge variant="completed">
                    <CheckCircle2 size={10} /> Completed
                  </Badge>
                ) : isFailed ? (
                  <Badge variant="failed">Failed</Badge>
                ) : (
                  <Badge variant="running">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    Running
                  </Badge>
                )}
                <span className="text-[10px] text-slate-400">ID: {sessionId
                                                                  ? sessionId.slice(0,8)
                                                                  : "Preparing..."}…</span>
                {session?.createdAt && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock size={10} /> {formatRelativeTime(session.createdAt)}
                  </span>
                )}
                <span className={`text-[10px] flex items-center gap-1 ${isConnected ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
                  {isConnected ? 'Live' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Right side of top bar */}
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <div className="hidden md:flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {session?.documents.filter(d => d.status === 'completed').length ?? 0}
                /{session?.documents.length ?? 0} docs
              </span>
              <ProgressBar value={overallProgress} className="w-28" showLabel />
            </div>

            {/* Report download button - shown when done */}
            {isDone && session?.reportUrl && (
              <a
                // href={session.reportUrl}
                href={`${session.reportUrl}${session.reportUrl.includes('?') ? '&' : '?'}web=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <ExternalLink size={11} /> View Report
              </a>
            )}
            {isDone && (
            <button
              type="button"
              onClick={handleExportReport}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={11} />

              {isDownloading
                ? 'Downloading...'
                : 'Export Report'}
            </button>
            )}

            {isDone && (
              <Link
                href="/home"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors"
              >
                <LayoutDashboard size={11} />
                Home
              </Link>
            )}

            {/* Polaris Platform link — visible throughout, disabled while running */}
                {/* {config.polarisUrl && (
                  <div className="relative group flex-shrink-0">
                    {isDone || isFailed ? (
                      <a
                        href={config.polarisUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                      >
                        <Globe size={10} />
                        Polaris Platform
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-slate-400 border border-slate-200 rounded-md cursor-not-allowed"
                      >
                        <Globe size={10} />
                        Polaris Platform
                      </button>
                    )} */}

                    {/* Warning tooltip on hover while running */}
                    {/* {!isDone && !isFailed && (
                      <div className="absolute left-0 top-full mt-1 w-52 px-2.5 py-1.5 bg-slate-800 text-white text-[10px] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20">
                        Cannot leave the document audit while it's running. Wait for it to finish.
                      </div>
                    )}
                  </div>
                )} */}

          </div>
        </div>
      </div>

      {/* Pipeline timeline */}
      {session && (
          <div className="flex-shrink-0 bg-white border-b border-slate-200 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 overflow-x-auto">
            <AuditTimeline steps={session.steps} />
          </div>
        )}

      {/* Main content — responsive split */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* LEFT — AI Chat (70%) */}
        <div className="flex-[7] flex flex-col border-r border-slate-200 overflow-hidden min-w-0">
          {/* Panel header */}
          <div className="flex-shrink-0 px-4 md:px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-700">AI Audit Agent</p>
              {!isDone && !isFailed && (
                <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <LoadingDots className="scale-75" />
                  {session?.currentCheck ?? 'Processing…'}
                </p>
              )}
            </div>
            {pendingValidation && (
              <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-medium">
                <AlertTriangle size={10} className="text-amber-500" />
                Action needed
              </div>
            )}
            {isDone && session?.overallScore && (
              <div className="text-xs font-bold text-emerald-600">
                Score: {session.overallScore}%
              </div>
            )}
          </div>

          {/* AI disclaimer */}
          <div className="flex-shrink-0 px-4 md:px-5 py-1.5 bg-amber-50 border-b border-amber-100">
            <p className="text-[9px] text-amber-700 text-center leading-relaxed">
              AI-generated results may contain errors or inaccuracies. Please review the
              findings and recommendations before taking action.
            </p>
          </div>  
          
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4 space-y-3">
          

            {chatMessages.length === 0 && !session && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                  <LoadingDots />
                </div>
                <p className="text-sm text-slate-500">Loading session…</p>
              </div>
            )}

            {chatMessages.length === 0 && session && isDone && (
              <div className="flex flex-col gap-4 p-5">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Audit Completed</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {session.completedAt
                        ? `Finished ${formatRelativeTime(session.completedAt)}`
                        : 'Audit finished successfully'}
                    </p>
                  </div>
                </div>

                {session.overallScore !== undefined && (
                  <div className="bg-emerald-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-emerald-600">
                      {session.overallScore}%
                    </p>
                    <p className="text-xs text-emerald-700 mt-1 font-medium">
                      Overall Audit Score
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      Project
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
                      {session.projectName || '—'}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      Client
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
                      {session.clientName || '—'}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      Documents
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5">
                      {session.documents.length} audited
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      Audit Type
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5 uppercase">
                      {session.auditType || '—'}
                    </p>
                  </div>
                </div>

                {session.reportUrl && (
                  <a
                    href={session.reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    <ExternalLink size={12} />
                    View Report on SharePoint
                  </a>
                )}

                <p className="text-[10px] text-slate-400 text-center">
                  Live activity log is only available during an active audit session.
                </p>
              </div>
            )}

            {/* Failed audit sessions components */}
            {chatMessages.length === 0 && session && isFailed && (
              <div className="flex flex-col gap-4 p-5">
                {/* Failed header */}
                <div className="flex items-center gap-3 pb-3 border-b border-red-100">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={20} className="text-red-500" />
                  </div>

                  <div>
                    <p className="text-sm font-bold text-red-700">
                      Audit Failed
                    </p>
                    <p className="text-xs text-red-400 mt-0.5">
                      The audit pipeline failed for this project.
                    </p>
                  </div>
                </div>

                {/* Failed status */}
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">
                    Failed
                  </p>
                  <p className="text-xs text-red-700 mt-1 font-medium">
                    Audit Pipeline Status
                  </p>
                </div>

                {/* Audit details */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      Project
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
                      {session.projectName || '—'}
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      Client
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
                      {session.clientName || '—'}
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      Documents
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5">
                      {session.documents.length} submitted
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      Audit Type
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5 uppercase">
                      {session.auditType || '—'}
                    </p>
                  </div>
                </div>

                {/* Failure information */}
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <p className="text-[10px] text-red-500 font-medium uppercase tracking-wide">
                    Status
                  </p>
                  <p className="text-xs font-semibold text-red-700 mt-0.5">
                    This audit could not be completed because the pipeline failed.
                  </p>
                </div>

                <p className="text-[10px] text-slate-400 text-center">
                  No audit report was generated for this failed session.
                </p>
              </div>
            )}

            {chatMessages.map(msg => (
              <ChatMessageCard key={msg.id} message={msg} />
            ))}
          </div>
        </div>

        {/* RIGHT — Activity panel (30%) */}
        <div className="flex-[3] flex flex-col min-w-[240px] overflow-hidden bg-white">
          {/* Tab switcher */}
          <div className="flex border-b border-slate-200 bg-white flex-shrink-0">
            {([
              { key: 'queue', label: 'Document Queue' },
              { key: 'log',   label: 'Live Log' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === tab.key
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                {tab.key === 'log' && liveLog.length > 0 && (
                  <span className="ml-1.5 bg-blue-100 text-blue-600 text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                    {liveLog.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'queue' ? (
              <DocumentQueue
                documents={session?.documents ?? []}
                currentDocumentId={session?.currentDocumentId}
                currentCheck={session?.currentCheck}
              />
            ) : (
              <LiveLog entries={liveLog} />
            )}
          </div>
        </div>
      </div>

      {/* Validation modal — appears when backend pauses for user input */}
      {pendingValidation && (
        <ValidationModal
          docs={pendingValidation}
          frameworkCategories={frameworkCategories}
          onConfirm={handleValidationConfirm}
        />
      )}
    </div>
  )
}

export default function AuditPage() {
  return (
    <div className="fixed inset-0 flex flex-col bg-white overflow-hidden">
      <Suspense fallback={
        <div className="flex items-center justify-center h-full">
          <LoadingDots />
        </div>
      }>
        <AuditPageInner />
      </Suspense>
    </div>
  )
}