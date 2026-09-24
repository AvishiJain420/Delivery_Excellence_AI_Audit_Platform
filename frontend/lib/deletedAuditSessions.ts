const DELETED_AUDIT_SESSIONS_KEY = 'polaris_deleted_audit_sessions'

export function getDeletedAuditSessionIds(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(DELETED_AUDIT_SESSIONS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function addDeletedAuditSession(sessionId: string): void {
  if (typeof window === 'undefined') return

  const existing = getDeletedAuditSessionIds()

  if (existing.includes(sessionId)) return

  localStorage.setItem(
    DELETED_AUDIT_SESSIONS_KEY,
    JSON.stringify([...existing, sessionId]),
  )
}