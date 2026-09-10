'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/dashboard/StatCard'
import { RecentAuditsTable } from '@/components/dashboard/RecentAuditsTable'
import { StartAuditModal } from '@/components/dashboard/StartAuditModal'

import { useUIStore } from '@/store'
import {
  useDashboardStats,
  useRecentAudits,
  useCurrentUser,
} from '@/hooks'

import {
  LayoutDashboard,
  CheckCircle2,
  Play,
  XCircle,
  FileText,
} from 'lucide-react'


function DashboardInner() {

  const params =
    useSearchParams()

  const itemId =
    params.get('item_id')

  const {
    data: currentUser,
  } = useCurrentUser()

  const {
    startAuditModalOpen,
    setStartAuditModal,
  } = useUIStore()

  const {
    data: stats,
    isLoading: statsLoading,
  } = useDashboardStats()

  const {
    data: audits,
    isLoading: auditsLoading,
  } = useRecentAudits()


  /**
   * Power Apps deep-link support.
   *
   * If dashboard was opened with ?item_id=XX,
   * automatically open the audit modal.
   */
  useEffect(() => {

    if (itemId) {
      setStartAuditModal(true)
    }

  }, [
    itemId,
    setStartAuditModal,
  ])


  const displayStats =
    stats ?? {
      total: 0,
      completed: 0,
      running: 0,
      failed: 0,
      pending: 0,
    }


  return (
    <AppShell>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">

        <div>

          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <LayoutDashboard size={12} />
            <span>
              Dashboard
            </span>
          </div>


          <div className="flex items-center gap-2">

            <h1 className="text-xl font-bold text-slate-900">
              Document Audit Overview
            </h1>

            {currentUser?.role === 'admin' && (
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full">
                Admin View
              </span>
            )}

          </div>


          <p className="text-sm text-slate-500 mt-0.5">

            {new Date().toLocaleDateString(
              'en-US',
              {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              },
            )}

          </p>

        </div>

      </div>


      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

        <StatCard
          label="Total Audits"
          value={displayStats.total}
          icon={FileText}
          color="slate"
          loading={statsLoading}
        />

        <StatCard
          label="Completed"
          value={displayStats.completed}
          icon={CheckCircle2}
          color="emerald"
          subtitle={`${displayStats.total
            ? Math.round(
                (displayStats.completed /
                  displayStats.total) *
                  100,
              )
            : 0
          }% success rate`}
          loading={statsLoading}
        />

        <StatCard
          label="Running"
          value={displayStats.running}
          icon={Play}
          color="blue"
          subtitle="Currently active"
          loading={statsLoading}
        />

        <StatCard
          label="Failed"
          value={displayStats.failed}
          icon={XCircle}
          color="red"
          loading={statsLoading}
        />

      </div>


      {/* Recent audits */}
      <RecentAuditsTable
        audits={audits ?? []}
        loading={auditsLoading}
      />


      {/* Start Audit Modal */}
      {startAuditModalOpen && (
        <StartAuditModal
          onClose={() =>
            setStartAuditModal(false)
          }
          defaultItemId={
            itemId ?? undefined
          }
        />
      )}

    </AppShell>
  )
}


export default function DashboardPage() {

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">

          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />

        </div>
      }
    >

      <DashboardInner />

    </Suspense>
  )
}