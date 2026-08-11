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
  })
}

// ─── Dashboard hooks ──────────────────────────────────────────────────────────
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.getStats,
    refetchInterval: 30_000,
    enabled: authApi.isLoggedIn(),
  })
}

export function useRecentAudits(limit = 10) {
  return useQuery({
    queryKey: ['dashboard', 'recent', limit],
    queryFn: () => dashboardApi.getRecentAudits(limit),
    refetchInterval: 15_000,
    enabled: authApi.isLoggedIn(),
  })
}


// ─── Start audit mutations ────────────────────────────────────────────────────
export function useStartAudit() {
  const router = useRouter()
  const { initSession } = useAuditStore()
  const qc = useQueryClient()

  const powerAppMutation = useMutation({
    mutationFn: auditApi.startFromPowerApp,
    onSuccess: (data) => {
      initSession(
        data.session_id,
        `${data.project_name} — ${data.audit_type ?? 'Audit'}`,
        data.project_name,
        data.client_name,
        data.audit_type ?? '',
      )
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      router.push(`/audit?id=${data.session_id}`)
    },
    onError: (error: any) => {
      console.error('Error starting audit:', error)
    },
  })

  const manualMutation = useMutation({
    mutationFn: auditApi.startManual,
    onSuccess: (data, vars) => {
      initSession(
        data.session_id,
        `${data.project_name} — Manual Audit`,
        data.project_name,
        data.client_name,
        'manual',
      )
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      router.push(`/audit?id=${data.session_id}`)
    },
    onError: (error: any) => {
      console.error('Error starting manual audit:', error)
    },
  })

  return { powerAppMutation, manualMutation }
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


