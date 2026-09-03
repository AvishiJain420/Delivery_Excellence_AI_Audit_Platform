'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/dashboard/StatCard'
import { RecentAuditsTable } from '@/components/dashboard/RecentAuditsTable'
import { StartAuditModal } from '@/components/dashboard/StartAuditModal'
import { useUIStore } from '@/store'
import { useDashboardStats, useRecentAudits, useCurrentUser} from '@/hooks'
import { LayoutDashboard, CheckCircle2, Play, XCircle, FileText, Plus ,Globe } from 'lucide-react'
import {config} from '@/lib/config'
import { useStartAudit } from '@/hooks'

function DashboardInner() {
  const params = useSearchParams()
  const {data : currentUser} = useCurrentUser()
  const itemId = params.get('item_id')   // set when coming from Power Apps redirect
  const { startAuditModalOpen, setStartAuditModal } = useUIStore()
  const { powerAppMutation } = useStartAudit()

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats()
  const { data: audits, isLoading: auditsLoading, refetch: refetchAudits } = useRecentAudits()

  // If we came from Power Apps with item_id, auto-open modal pre-filled
  useEffect(() => {
    if (itemId) setStartAuditModal(true)
  }, [itemId]) // eslint-disable-line

  const displayStats = stats ?? { total: 0, completed: 0, running: 0, failed: 0, pending: 0 }

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <LayoutDashboard size={12} />
            <span>Dashboard</span>
          </div>

          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Document Audit Overview</h1>
            {currentUser?.role === 'admin' && (
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full">
                Admin View
              </span>
            )}
          </div>
          
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* {config.polarisUrl && (
            <a
              href={config.polarisUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Globe size={13} /> Polaris Platform
            </a>
          )} */}
          {/*
          <button
            onClick={() => setStartAuditModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={14} /> Start Doc Audit (Coming Soon)
          </button> */}
        </div> 
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Audits" value={displayStats.total} icon={FileText} color="slate"
          loading={statsLoading} />
        <StatCard label="Completed" value={displayStats.completed} icon={CheckCircle2} color="emerald"
          subtitle={`${displayStats.total ? Math.round((displayStats.completed / displayStats.total) * 100) : 0}% success rate`}
          loading={statsLoading} />
        <StatCard label="Running" value={displayStats.running} icon={Play} color="blue"
          subtitle="Currently active" loading={statsLoading} />
        <StatCard label="Failed" value={displayStats.failed} icon={XCircle} color="red"
          loading={statsLoading} />
      </div>

      {/* Recent audits */}
      <RecentAuditsTable audits={audits ?? []} loading={auditsLoading} />

      {/* Agent ecosystem placeholder
      <div className="mt-5 bg-slate-100 rounded-xl p-5 border border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-slate-700">
              Agent Ecosystem — Coming Soon
            </h3>

            <p className="text-slate-500 text-xs mt-1 max-w-lg">
              Expanding beyond Document Audit: Code Audit Agent, Compliance Review,
              AI Assistant, and Knowledge Repository.
            </p>
          </div>

          <div className="hidden md:flex gap-2 flex-wrap">
            {[
              'Code Audit',
              'Compliance',
              'AI Assistant',
              'Knowledge Base'
            ].map(label => (
              <span
                key={label}
                className="
                  px-2.5 py-1 rounded-full
                  bg-white
                  text-[10px]
                  font-medium
                  text-slate-600
                  border border-slate-300
                "
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div> */}

      {/* Start Audit Modal */}
      {startAuditModalOpen && (
        <StartAuditModal
          onClose={() => setStartAuditModal(false)}
          defaultItemId={itemId ?? undefined}
        />
      )}
    </AppShell>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
        <DashboardInner />
    </Suspense>
  )
}
