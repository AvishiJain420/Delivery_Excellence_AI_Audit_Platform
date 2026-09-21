/**
 * services/api.ts
 */

import type {
  BackendUser,
  BackendSession,
  AuditSummary,
  DashboardStats,
  AuditStatus,
  AuditDocument,
  AuditSession,
  StepStatus,
} from '@/types'

import { PIPELINE_STEPS } from '@/lib/utils'

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

/**
 * How long we allow the refresh endpoint to respond before
 * considering the refresh attempt failed.
 */
const REFRESH_TIMEOUT_MS = 10_000
const API_TIMEOUT_MS = 20_000

/**
 * Shared refresh promise.
 *
 * This is VERY important.
 *
 * Without this, if several API calls receive 401 at the same time:
 *
 *   Request A → 401 → refresh
 *   Request B → 401 → refresh
 *   Request C → 401 → refresh
 *
 * all three calls can hit /auth/refresh simultaneously.
 *
 * With this variable:
 *
 *   Request A → 401 ─┐
 *   Request B → 401 ─┼→ ONE refresh request
 *   Request C → 401 ─┘
 *
 * All requests wait for the same refresh operation.
 */
let refreshPromise: Promise<boolean> | null = null

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

async function apiFetch(
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  const token = TokenStore.getAccess()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',

    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),

    ...(opts.headers as Record<string, string> ?? {}),
  }

  const controller = new AbortController()

  const timeoutId = window.setTimeout(() => {
    controller.abort()
  }, API_TIMEOUT_MS)

  let res: Response

  try {
    res = await fetch(`${API_URL}${path}`, {
      ...opts,
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      throw new Error(`Request timed out: ${path}`)
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }

  /**
   * Normal successful/non-auth response.
   */
  if (res.status !== 401) {
    return res
  }

  /**
   * If we are already on an auth page, don't start another
   * authentication redirect loop.
   */
  if (
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/auth')
  ) {
    return res
  }

  /**
   * Try refreshing the access token.
   *
   * attemptRefresh() is concurrency-safe, so even if several
   * requests arrive here simultaneously, only ONE refresh request
   * will actually be sent to the backend.
   */
  const refreshed = await attemptRefresh()

  if (refreshed) {
    const newAccessToken = TokenStore.getAccess()

    /**
     * If for some reason refresh reported success but there is
     * no access token in storage, don't retry with an empty token.
     */
    if (!newAccessToken) {
      TokenStore.clear()
      redirectToLogin()
      return res
    }

    /**
     * Create fresh headers rather than mutating the old object.
     */
    const retryHeaders: Record<string, string> = {
      'Content-Type': 'application/json',

      ...(opts.headers as Record<string, string> ?? {}),

      Authorization: `Bearer ${newAccessToken}`,
    }

    /**
     * Retry the original request exactly once.
     *
     * We deliberately do NOT recursively call apiFetch() here.
     * Otherwise a bad token could create an infinite 401 → refresh
     * → 401 → refresh loop.
     */
    const retryController = new AbortController()

    const retryTimeoutId = window.setTimeout(() => {
      retryController.abort()
    }, API_TIMEOUT_MS)

    let retryResponse: Response

    try {
      retryResponse = await fetch(`${API_URL}${path}`, {
        ...opts,
        headers: retryHeaders,
        signal: retryController.signal,
      })
    } finally {
      window.clearTimeout(retryTimeoutId)
    }

    /**
     * If the refreshed token is still rejected, clear the local
     * authentication state and send the user back to login.
     */
    if (retryResponse.status === 401) {
      TokenStore.clear()
      redirectToLogin()
    }

    return retryResponse
  }

  /**
   * Refresh failed.
   *
   * Clear tokens and redirect to login.
   */
  TokenStore.clear()

  redirectToLogin()

  return res
}

// ─── Redirect helper ───────────────────────────────────────────────────────────

function redirectToLogin() {
  if (typeof window === 'undefined') return

  const currentPath =
    window.location.pathname +
    window.location.search

  /**
   * Never redirect if we are already somewhere under /auth.
   */
  if (currentPath.startsWith('/auth')) {
    return
  }

  const loginUrl =
    currentPath
      ? `/auth/login?return_to=${encodeURIComponent(currentPath)}`
      : '/auth/login'

  console.log(
    '[apiFetch] Authentication failed.',
  )

  console.log(
    '[apiFetch] Current path:',
    currentPath,
  )

  console.log(
    '[apiFetch] Redirecting to:',
    loginUrl,
  )

  window.location.href = loginUrl
}

// ─── Refresh token ─────────────────────────────────────────────────────────────

async function attemptRefresh(): Promise<boolean> {
  /**
   * If another request is already refreshing the token,
   * wait for that same operation.
   */
  if (refreshPromise) {
    return refreshPromise
  }

  const refreshToken = TokenStore.getRefresh()

  if (!refreshToken) {
    return false
  }

  /**
   * Create one shared refresh operation.
   */
  refreshPromise = (async () => {
    try {
      const controller = new AbortController()

      const timeoutId = window.setTimeout(() => {
        controller.abort()
      }, REFRESH_TIMEOUT_MS)

      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            refresh_token: refreshToken,
          }),

          signal: controller.signal,
        })

        if (!res.ok) {
          console.warn(
            '[auth] Token refresh failed:',
            res.status,
          )

          return false
        }

        const data = await res.json()

        const accessToken = data?.access_token
        const newRefreshToken =
          data?.refresh_token ?? refreshToken

        if (!accessToken) {
          console.warn(
            '[auth] Refresh response did not contain access_token',
          )

          return false
        }

        /**
         * Store the new access token.
         *
         * Some backends rotate the refresh token while others
         * return the existing one. Supporting both is safer.
         */
        TokenStore.setTokens(
          accessToken,
          newRefreshToken,
        )

        console.log(
          '[auth] Access token refreshed successfully',
        )

        return true
      } finally {
        window.clearTimeout(timeoutId)
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        console.warn(
          '[auth] Token refresh timed out',
        )
      } else {
        console.warn(
          '[auth] Token refresh request failed:',
          error,
        )
      }

      return false
    } finally {
      /**
       * Very important:
       *
       * Allow another refresh operation later if necessary.
       */
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// ─── Auth API ──────────────────────────────────────────────────────────────────

export const authApi = {
  async getLoginUrl(
    returnTo: string = '/dashboard',
  ): Promise<string> {
    const url = new URL(
      `${API_URL}/auth/azure/login`,
    )

    url.searchParams.set(
      'return_to',
      returnTo,
    )

    const res = await fetch(url.toString())

    if (!res.ok) {
      throw new Error(
        'Failed to get login URL',
      )
    }

    const { auth_url } = await res.json()

    return auth_url
  },

  /**
   * Called on /auth/callback page.
   *
   * React StrictMode in Next.js development can run useEffect twice.
   *
   * First run:
   *
   *   hash contains tokens
   *   ↓
   *   store tokens
   *   ↓
   *   remove hash
   *
   * Second run:
   *
   *   hash is empty
   *   ↓
   *   retrieve tokens from localStorage
   *
   * This prevents the second StrictMode execution from
   * incorrectly reporting "Auth Failed".
   */
  handleCallback(): {
    access_token: string
    refresh_token: string
  } | null {
    if (typeof window === 'undefined') {
      return null
    }

    const fragment =
      window.location.hash.substring(1)

    const params =
      new URLSearchParams(fragment)

    const accessToken =
      params.get('access_token')

    const refreshToken =
      params.get('refresh_token')

    /**
     * First execution:
     * tokens are present in the URL fragment.
     */
    if (accessToken && refreshToken) {
      TokenStore.setTokens(
        accessToken,
        refreshToken,
      )

      /**
       * IMPORTANT:
       *
       * Preserve the query string.
       *
       * Example:
       *
       * /auth/callback?return_to=%2Fdashboard#access_token=...
       *
       * becomes:
       *
       * /auth/callback?return_to=%2Fdashboard
       *
       * instead of losing ?return_to=/dashboard.
       */
      const cleanUrl =
        window.location.pathname +
        window.location.search

      window.history.replaceState(
        {},
        document.title,
        cleanUrl,
      )

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
      }
    }

    /**
     * Second StrictMode execution or page refresh.
     *
     * The hash has already been removed, so retrieve the
     * tokens that were stored during the first execution.
     */
    const storedAccessToken =
      TokenStore.getAccess()

    const storedRefreshToken =
      TokenStore.getRefresh()

    if (
      storedAccessToken &&
      storedRefreshToken
    ) {
      return {
        access_token: storedAccessToken,
        refresh_token: storedRefreshToken,
      }
    }

    /**
     * No tokens anywhere.
     *
     * This is a genuine authentication failure.
     */
    return null
  },

  async getMe(): Promise<BackendUser> {
    const res = await apiFetch('/auth/me')

    if (!res.ok) {
      let message = 'Failed to load current user'

      try {
        const error = await res.json()
        message = error?.detail ?? error?.message ?? message
      } catch {
        // Ignore invalid/non-JSON response
      }

      throw new Error(message)
    }

    return res.json()
  },

  clearTokens() {
    TokenStore.clear()
  },

  logout() {
    TokenStore.clear()

    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login'
    }
  },

  isLoggedIn(): boolean {
    return !!TokenStore.getAccess()
  },
}

// ─── Audit API ─────────────────────────────────────────────────────────────────

export const auditApi = {
  // async startFromPowerApp(
  //   sharepoint_item_id: string,
  // ): Promise<{
  //   session_id: string
  //   project_name: string
  //   client_name: string
  //   audit_type: string
  // }> {
  //   const res = await apiFetch(
  //     '/audit/sessions/powerapp',
  //     {
  //       method: 'POST',

  //       body: JSON.stringify({
  //         sharepoint_item_id,
  //       }),
  //     },
  //   )

  //   if (!res.ok) {
  //     let message = 'Failed to start audit'

  //     try {
  //       const err = await res.json()

  //       message =
  //         err.detail ?? message
  //     } catch {}

  //     throw new Error(message)
  //   }

  //   return res.json()
  // },

  async startManual(data: {
    project_name: string
    client_name: string
    project_code: string
    sharepoint_item_id?: string | null
  }): Promise<{
    session_id: string
    project_name: string
    client_name: string
  }> {
    const res = await apiFetch(
      '/audit/sessions/manual',
      {
        method: 'POST',

        body: JSON.stringify(data),
      },
    )

    if (!res.ok) {
      let message = 'Failed to start audit'

      try {
        const err = await res.json()

        message =
          err.detail ?? message
      } catch {}

      throw new Error(message)
    }

    return res.json()
  },

  async listSessions(): Promise<BackendSession[]> {
    const res = await apiFetch(
      '/audit/sessions',
    )

    if (!res.ok) {
      throw new Error(
        'Failed to fetch sessions',
      )
    }

    return res.json()
  },

  async getSession(
    sessionId: string,
  ): Promise<BackendSession> {
    const res = await apiFetch(
      `/audit/sessions/${sessionId}`,
    )

    if (!res.ok) {
      throw new Error(
        `Session ${sessionId} not found`,
      )
    }

    return res.json()
  },

  async stopPipeline(
    sessionId: string,
  ): Promise<{
    status: 'stop_signal_sent' | 'no_active_pipeline'
  }> {
    const res = await apiFetch(
      `/audit/sessions/${sessionId}/stop`,
      {
        method: 'POST',
      },
    )

    if (!res.ok) {
      let message = 'Failed to stop audit pipeline'

      try {
        const error = await res.json()

        message =
          error.detail ??
          error.message ??
          message
      } catch {
        // Ignore invalid/non-JSON response
      }

      throw new Error(message)
    }

    return res.json()
  },

  async downloadReport(
    sessionId: string,
  ): Promise<{
    blob: Blob
    fileName: string
  }> {
    const res = await apiFetch(
      `/audit/sessions/${sessionId}/download`,
    )

    if (!res.ok) {
      let message =
        'Failed to download report'

      try {
        const error = await res.json()

        message =
          error.detail ?? message
      } catch {}

      throw new Error(message)
    }

    const blob = await res.blob()

    const contentDisposition =
      res.headers.get(
        'Content-Disposition',
      )

    /**
     * Handles:
     *
     * filename="report.xlsx"
     * filename=report.xlsx
     */
    const filenameMatch =
      contentDisposition?.match(
        /filename="?([^"]+)"?/,
      )

    const fileName =
      filenameMatch?.[1] ??
      'audit_report.xlsx'

    return {
      blob,
      fileName,
    }
  },

  async deleteSession(
    sessionId: string,
  ): Promise<void> {
    const res = await apiFetch(
      `/audit/sessions/${sessionId}`,
      {
        method: 'DELETE',
      },
    )

    if (!res.ok) {
      let message =
        'Failed to delete audit session'

      try {
        const error = await res.json()

        message =
          error.detail ?? message
      } catch {}

      throw new Error(message)
    }
  },
}

// ─── Dashboard API ─────────────────────────────────────────────────────────────

// ─── Dashboard API ─────────────────────────────────────────────────────────────
// ─── Dashboard API ─────────────────────────────────────────────────────────────

export const dashboardApi = {

  /**
   * Fetch all dashboard sessions.
   *
   * This is intentionally the ONLY network call used by the
   * dashboard hooks.
   *
   * React Query will cache this result so stats and recent
   * audits use the same request/result.
   */
  async getSessions(): Promise<BackendSession[]> {
    return auditApi.listSessions()
  },


  /**
   * Build dashboard statistics from the already-fetched
   * session list.
   */
  getStats(
    sessions: BackendSession[],
  ): DashboardStats {

    return {
      total: sessions.length,

      completed:
        sessions.filter(
          s => s.audit_status === 'done',
        ).length,

      running:
        sessions.filter(
          s =>
            ![
              'done',
              'failed',
              'pending',
              'cancelled',
              'error',
            ].includes(s.audit_status),
        ).length,

      failed:
        sessions.filter(
          s =>
            s.audit_status === 'failed' ||
            s.audit_status === 'error',
        ).length,

      pending:
        sessions.filter(
          s =>
            s.audit_status === 'pending',
        ).length,
    }
  },


  /**
   * Build recent audit rows from the same cached session list.
   *
   * Project/client information comes from the database response
   * returned by GET /audit/sessions.
   */
  getRecentAudits(
    sessions: BackendSession[],
    limit = 10,
  ): AuditSummary[] {

    return sessions
      .slice(0, limit)
      .map(s => {

        /**
         * Prefer flat DB fields if present.
         * Fall back to the nested project object.
         */
        const projectName =
          s.project_name ??
          s.project?.project_name ??
          ''

        const clientName =
          s.client_name ??
          s.project?.client_name ??
          ''

        return {

          id: s.session_id,

          name:
            projectName ||
            `Session ${s.session_id.slice(0, 8)}`,

          projectName:
            projectName ||
            'Unknown Project',

          clientName,

          status:
            s.audit_status,

          documentCount:
            s.document_count ?? 0,

          overallScore:
            s.overall_project_score != null
              ? Math.round(
                  Number(
                    s.overall_project_score,
                  ) * 20,
                )
              : undefined,

          auditType:
            s.audit_type ?? undefined,

          /**
           * Your BackendSession currently exposes completion_time.
           *
           * Use that rather than inventing a timestamp.
           */
          createdAt:
            s.completion_time ??
            '',

          completedAt:
            s.completion_time ??
            undefined,

          reportUrl:
            s.report?.sharepoint_url ??
            undefined,

          reportName:
            s.report?.report_name ??
            undefined,
        }
      })
  },
}

// ─── WebSocket URL builder ─────────────────────────────────────────────────────

export function buildWsUrl(
  sessionId: string,
): string {
  const wsBase = (
    process.env.NEXT_PUBLIC_WS_URL ??
    API_URL
  ).replace(/^http/, 'ws')

  const token =
    TokenStore.getAccess() ?? ''

  return (
    `${wsBase}/audit/sessions/` +
    `${sessionId}/run?token=${encodeURIComponent(token)}`
  )
}

// ─── Map backend session to frontend AuditSession ─────────────────────────────

export function mapBackendSessionToAuditSession(
  s: BackendSession,
): AuditSession {
  const projectName =
    (s as any).project_name ??
    s.project?.project_name ??
    ''

  const clientName =
    (s as any).client_name ??
    s.project?.client_name ??
    ''

  const name =
    projectName ||
    `Session ${s.session_id.slice(
      0,
      8,
    )}`

  const documents: AuditDocument[] =
    (s.documents ?? []).map(d => {
      const backendStatus =
        d.status ?? 'queued'

      const docStatus: import('@/types').DocumentStatus =
        backendStatus === 'completed'
          ? 'completed'
          : backendStatus === 'failed'
            ? 'failed'
            : backendStatus === 'queued'
              ? 'queued'
              : 'processing'

      return {
        id: d.document_id,

        name: d.file_name,

        type:
          d.framework_category ??
          'document',

        status: docStatus,

        progress:
          docStatus === 'completed'
            ? 100
            : docStatus === 'processing'
              ? 50
              : 0,

        checks: [],

        startedAt:
          d.started_at ??
          undefined,

        completedAt:
          d.completed_at ??
          undefined,
      }
    })

  const allDone =
    s.audit_status === 'done'

  const steps = PIPELINE_STEPS.map(
    step => ({
      ...step,

      status: (
        allDone
          ? 'completed'
          : 'pending'
      ) as StepStatus,

      completedAt:
        allDone
          ? (
              s.completion_time ??
              undefined
            )
          : undefined,
    }),
  )

  return {
    id: s.session_id,

    name,

    projectName,

    clientName,

    auditType:
      s.audit_type ?? '',

    status:
      s.audit_status,

    steps,

    documents,

    overallProgress:
      s.audit_status === 'done'
        ? 100
        : 0,

    createdAt:
      s.completion_time ??
      new Date().toISOString(),

    completedAt:
      s.completion_time ??
      undefined,

    reportUrl:
      s.report?.sharepoint_url ??
      undefined,

    reportName:
      s.report?.report_name ??
      undefined,
  }
}