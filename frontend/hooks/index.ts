/**
 * hooks/index.ts
 *
 * WHERE THIS FILE LIVES: frontend/hooks/index.ts
 *
 * useAuditSession: the main hook for the audit page.
 *   - Connects WebSocket to the running pipeline
 *   - Routes stage messages to the store
 *   - Handles the validation_required pause (collects user answer, sends it)
 *
 * useDashboardStats / useRecentAudits: data fetching hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auditApi, dashboardApi, authApi, mapBackendSessionToAuditSession } from '@/services/api'
import { auditWsService } from '@/services/websocket'
import { useAuditStore } from '@/store'
import type { DocumentCorrection } from '@/types'

// ─── Auth hooks ───────────────────────────────────────────────────────────────
export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: authApi.getMe,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  })
}

// ─── Dashboard hooks ──────────────────────────────────────────────────────────
// ─── Dashboard hooks ──────────────────────────────────────────────────────────

const DASHBOARD_SESSIONS_QUERY_KEY = [
  'dashboard',
  'sessions',
] as const


/**
 * Single source of truth for dashboard session data.
 *
 * Both statistics and recent audits consume this same
 * React Query cache entry.
 *
 * Result:
 *
 *     Dashboard
 *          |
 *          v
 *     GET /audit/sessions
 *          |
 *          v
 *     React Query cache
 *        /       \
 *       /         \
 *    Stats     Recent Audits
 */
export function useDashboardSessions() {
  return useQuery({
    queryKey: DASHBOARD_SESSIONS_QUERY_KEY,

    queryFn:
      dashboardApi.getSessions,

    /**
     * Don't immediately refetch the same data every time
     * another dashboard hook mounts.
     */
    staleTime: 30_000,

    /**
     * Dashboard data doesn't need to be refetched simply
     * because the user changes browser tabs.
     */
    refetchOnWindowFocus: false,

    enabled:
      authApi.isLoggedIn(),
  })
}


/**
 * Dashboard statistics.
 *
 * Does NOT make its own API request.
 */
export function useDashboardStats() {

  const query =
    useDashboardSessions()

  return {
    ...query,

    data:
      query.data
        ? dashboardApi.getStats(
            query.data,
          )
        : undefined,
  }
}


/**
 * Recent audit list.
 *
 * Does NOT make its own API request.
 */
export function useRecentAudits(
  limit = 10,
) {

  const query =
    useDashboardSessions()

  return {
    ...query,

    data:
      query.data
        ? dashboardApi.getRecentAudits(
            query.data,
            limit,
          )
        : undefined,
  }
}


// ─── Start audit mutations ────────────────────────────────────────────────────
export function useStartAudit() {
  const router = useRouter()
  const { initSession } = useAuditStore()
  const qc = useQueryClient()

  const manualMutation = useMutation({
    mutationFn: auditApi.startManual,

    onSuccess: (data) => {
      initSession(
        data.session_id,
        `${data.project_name} — Manual Audit`,
        data.project_name,
        data.client_name,
        'manual',
      )

      qc.invalidateQueries({ queryKey: ['dashboard'] })

      router.push(`/ai-audit?id=${data.session_id}`)
    },

    onError: (error: any) => {
      console.error('Error starting manual audit:', error)
    },
  })

  return { manualMutation }
}

// ─── Main audit session hook ──────────────────────────────────────────────────

export function useAuditSession(sessionId: string | null) {
  const {
    handleStage,
    setConnected,
    confirmValidation,
    pendingValidation,
    loadSession,
    session,
  } = useAuditStore()

  const connectedRef = useRef(false)
  const sessionStatusRef = useRef<string | null>(null)   // ← add this line here

  // Hydrate store from DB on mount (covers page refresh)
  useEffect(() => {
    if (!sessionId) return
    if (session?.id === sessionId) return

    auditApi.getSession(sessionId)
      .then(backendSession => {
        const mapped = mapBackendSessionToAuditSession(backendSession)
        loadSession(mapped)
      })
      .catch(err => {
        console.error('Failed to load session from DB on mount:', err)
      })
  }, [sessionId]) // eslint-disable-line

  // Keep sessionStatusRef in sync without triggering WS reconnects
  useEffect(() => {
    if (session?.status) {
      sessionStatusRef.current = session.status
    }
  }, [session?.status])

  // ← WS effect goes here — unchanged except dependency array fix
  useEffect(() => {
    if (!sessionId || connectedRef.current) return

    const currentStatus = sessionStatusRef.current
    if (currentStatus && ['done', 'failed', 'cancelled'].includes(currentStatus)) {
      console.log("Skipping WebSocket — session already terminal:", currentStatus)
      return
    }

    connectedRef.current = true

    try {
      const unsubStage = auditWsService.onStage(handleStage)
      const unsubStatus = auditWsService.onStatus(setConnected)

      console.log("Connecting websocket for session:", sessionId)

      auditWsService.connect(sessionId)

      return () => {
        unsubStage()
        unsubStatus()
        auditWsService.disconnect()
        connectedRef.current = false
      }
    } catch (e) {
      console.error('Error connecting to audit pipeline:', e)
      connectedRef.current = false
    }
  }, [sessionId]) // eslint-disable-line

  const handleValidationConfirm = useCallback((
    approved: boolean,
    corrections: DocumentCorrection[] = [],
  ) => {
    auditWsService.sendValidationAnswer(approved, corrections)
    confirmValidation(approved)
  }, [confirmValidation])

  return { pendingValidation, handleValidationConfirm }
}

// ─── Fetch completed session (for history/results view) ───────────────────────
export function useSessionDetail(sessionId: string) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => auditApi.getSession(sessionId),
    enabled: !!sessionId,
  })
}

// ─── Utility ─────────────────────────────────────────────────────────────────
export function useTimeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return d.toLocaleDateString()
}


