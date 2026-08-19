'use client'
import { useEffect, useRef } from 'react'
import { authApi } from '@/services/api'

export default function AuthCallbackPage() {
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    // Store tokens from the URL hash
    const result = authApi.handleCallback()

    console.log('[Callback] handleCallback result:', result ? 'tokens stored' : 'NO TOKENS')

    if (!result) {
      // Clear stale return URL so next login starts fresh
      sessionStorage.removeItem('auth_return_url')
      window.location.replace('/auth/login')
      return
    }

    // Read the return URL that layout AuthGuard saved before login
    const returnUrl = sessionStorage.getItem('auth_return_url')
    console.log('[Callback] return URL from sessionStorage:', returnUrl)

    // Clear it — consumed
    sessionStorage.removeItem('auth_return_url')

    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('/auth')) {
      console.log('[Callback] Redirecting to:', returnUrl)
      window.location.replace(returnUrl)
    } else {
      console.log('[Callback] No saved URL, going to dashboard')
      window.location.replace('/dashboard')
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <span className="text-blue-600 text-xl">✓</span>
        </div>
        <p className="text-sm font-medium text-slate-700">Signing you in…</p>
        <p className="text-xs text-slate-400 mt-1">Please wait</p>
      </div>
    </div>
  )
}