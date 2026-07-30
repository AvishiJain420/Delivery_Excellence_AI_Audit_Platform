/**
 * services/api.ts
 *
 * WHERE THIS FILE LIVES: frontend/services/api.ts
 *
 * This is the ONLY place in the frontend that calls the backend REST API.
 * All components import from here — never fetch() directly in a component.
 *
 * Auth: reads access_token from localStorage, attaches as Bearer header.
 * Token refresh: if a call returns 401, tries /auth/refresh once then clears.
 */
import type {
  BackendUser, BackendSession, AuditSummary, DashboardStats, AuditStatus,
  AuditDocument, AuditSession, StepStatus,
} from '@/types'
import { PIPELINE_STEPS } from '@/lib/utils'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// ─── Token helpers ─────────────────────────────────────────────────────────────
export const TokenStore = {
  setTokens(access: string, refresh: string) {
    if (typeof window === 'undefined') return
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
  },
  getAccess(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('access_token')
  },
  getRefresh(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('refresh_token')
  },
  clear() {
    if (typeof window === 'undefined') return
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  },
}

// ─── Authenticated fetch ───────────────────────────────────────────────────────
async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = TokenStore.getAccess()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> ?? {}),
  }

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers })

  // Auto-refresh on 401
  if (res.status === 401) {
    const refreshed = await attemptRefresh()
    if (refreshed) {
      headers.Authorization = `Bearer ${TokenStore.getAccess()}`
      return fetch(`${API_URL}${path}`, { ...opts, headers })
    }
    // Redirect to login if refresh failed
    TokenStore.clear()
    if (typeof window !== 'undefined') window.location.href = '/auth/login'
  }

  return res
}

async function attemptRefresh(): Promise<boolean> {
  const refresh_token = TokenStore.getRefresh()
  if (!refresh_token) return false
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    })
    if (!res.ok) return false
    const { access_token, refresh_token: new_refresh } = await res.json()
    TokenStore.setTokens(access_token, new_refresh)
    return true
  } catch { return false }
}

// ─── Auth API ──────────────────────────────────────────────────────────────────
export const authApi = {
  /**
   * Step 1: Get the Microsoft login URL.
   * Frontend calls this, then does: window.location.href = data.auth_url
   */
  async getLoginUrl(): Promise<string> {
    const res = await fetch(`${API_URL}/auth/azure/login`)
    if (!res.ok) throw new Error('Failed to get login URL')
    const { auth_url } = await res.json()
    return auth_url
  },

  /**
   * Step 2: Called on /auth/callback page.
   * Reads tokens from URL fragment (#access_token=...&refresh_token=...)
   * Stores them and returns the user.
   */
  handleCallback(): { access_token: string; refresh_token: string } | null {
    if (typeof window === 'undefined') return null
    const fragment = window.location.hash.substring(1)
    const params = new URLSearchParams(fragment)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (!access_token || !refresh_token) return null
    TokenStore.setTokens(access_token, refresh_token)
    window.history.replaceState({}, document.title, window.location.pathname)
    return { access_token, refresh_token }
  },

  async getMe(): Promise<BackendUser> {
    const res = await apiFetch('/auth/me')
    if (!res.ok) throw new Error('Not authenticated')
    return res.json()
  },

  logout() {
    TokenStore.clear()
    if (typeof window !== 'undefined') window.location.href = '/auth/login'
  },

  isLoggedIn(): boolean {
    return !!TokenStore.getAccess()
  },
}

// ─── Audit API ─────────────────────────────────────────────────────────────────
export const auditApi = {
  /**
   * Flow 1: User came from Power Apps with ?item_id=68 in URL.
   * Fetches project from SharePoint and creates a session.
   */
  async startFromPowerApp(sharepoint_item_id: string): Promise<{
      session_id: string; project_name: string; client_name: string; audit_type: string
    }> {
      const res = await apiFetch('/audit/sessions/powerapp', {
        method: 'POST',
        body: JSON.stringify({ sharepoint_item_id }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail ?? 'Failed to start audit')
      }
      return res.json()
    },

  /**
   * Flow 2: User fills form on site manually.
   */
  async startManual(data: {
    project_name: string
    client_name: string
    project_code: string
    sharepoint_item_id?: string | null
  }): Promise<{ session_id: string; project_name: string; client_name: string }> {
    const res = await apiFetch('/audit/sessions/manual', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail ?? 'Failed to start audit')
    }
    return res.json()
  },

  async listSessions(): Promise<BackendSession[]> {
    const res = await apiFetch('/audit/sessions')
    if (!res.ok) throw new Error('Failed to fetch sessions')
    return res.json()
  },

  async getSession(sessionId: string): Promise<BackendSession> {
    const res = await apiFetch(`/audit/sessions/${sessionId}`)
    if (!res.ok) throw new Error(`Session ${sessionId} not found`)
    return res.json()
  },

  async deleteSession(sessionId: string): Promise<void> {
    await apiFetch(`/audit/sessions/${sessionId}`, { method: 'DELETE' })
  },
}

// ─── Dashboard API ─────────────────────────────────────────────────────────────
// Derives stats from the sessions list — no separate backend endpoint needed
export const dashboardApi = {
  async getStats(): Promise<DashboardStats> {
    const sessions = await auditApi.listSessions()
    return {
      total: sessions.length,
      completed: sessions.filter(s => s.audit_status === 'done').length,
      running: sessions.filter(s => !['done','failed','pending'].includes(s.audit_status)).length,
      failed: sessions.filter(s => s.audit_status === 'failed').length,
      pending: sessions.filter(s => s.audit_status === 'pending').length,
    }
  },
  
  async getRecentAudits(limit = 10): Promise<AuditSummary[]> {
    const sessions = await auditApi.listSessions()
    return sessions.slice(0, limit).map(s => {
      // The list endpoint returns flat project fields, not nested under `project`
      const projectName = (s as any).project_name ?? s.project?.project_name ?? ''
      const clientName = (s as any).client_name ?? s.project?.client_name ?? ''
      
      return {
        id: s.session_id,
        name: projectName || `Session ${s.session_id.slice(0, 8)}`,
        projectName: projectName || 'Unknown Project',
        clientName,
        status: s.audit_status,
        documentCount: s.document_count ?? 0,

        overallScore:
          s.overall_project_score != null
            ? Math.round(Number(s.overall_project_score) * 20)
            : undefined,
        
        auditType: s.audit_type ?? undefined,
        createdAt: s.completion_time ?? new Date().toISOString(),
        completedAt: s.completion_time ?? undefined,
      }
    })
  },
  
}

// ─── WebSocket URL builder ─────────────────────────────────────────────────────
export function buildWsUrl(sessionId: string): string {
  const wsBase = (process.env.NEXT_PUBLIC_WS_URL ?? API_URL).replace(/^http/, 'ws')
  const token = TokenStore.getAccess() ?? ''
  return `${wsBase}/audit/sessions/${sessionId}/run?token=${token}`
}

/**
 * Maps a full BackendSession (from GET /audit/sessions/{id}) to an AuditSession
 * suitable for loading into the Zustand store via loadSession().
 * Called on page refresh to hydrate store state from the database.
 */
export function mapBackendSessionToAuditSession(s: BackendSession): AuditSession {
  // List endpoint returns flat fields; detail endpoint nests them under `project`
  const projectName = (s as any).project_name ?? s.project?.project_name ?? ''
  const clientName = (s as any).client_name ?? s.project?.client_name ?? ''
  const name = projectName || `Session ${s.session_id.slice(0,8)}`
  const documents: AuditDocument[] = (s.documents ?? []).map(d => {
    const backendStatus = d.status ?? 'queued'
    const docStatus: import('@/types').DocumentStatus =
      backendStatus === 'completed' ? 'completed'
      : backendStatus === 'failed' ? 'failed'
      : backendStatus === 'queued' ? 'queued'
      : 'processing'

    return {
      id: d.document_id,
      name: d.file_name,
      type: d.framework_category ?? 'document',
      status: docStatus,
      progress: docStatus === 'completed' ? 100 : docStatus === 'processing' ? 50 : 0,
      checks: [],
      startedAt: d.started_at ?? undefined,
      completedAt: d.completed_at ?? undefined,
    }
  })

  const steps = PIPELINE_STEPS.map(step => ({ ...step, status: 'pending' as StepStatus }))

  return {
    id: s.session_id,
    name,
    projectName,
    clientName,
    auditType: s.audit_type ?? '',
    status: s.audit_status,
    steps,
    documents,
    overallProgress: s.audit_status === 'done' ? 100 : 0,
    createdAt: s.completion_time ?? new Date().toISOString(),
    completedAt: s.completion_time ?? undefined,
    reportUrl: s.report?.sharepoint_url ?? undefined,
    reportName: s.report?.report_name ?? undefined,
  }
}
