'use client'
/**
 * app/auth/callback/page.tsx
 *
 * WHERE THIS FILE LIVES: frontend/app/auth/callback/page.tsx
 *
 * Azure AD redirects here after login:
 *   http://localhost:3000/auth/callback#access_token=...&refresh_token=...
 *
 * This page:
 *   1. Reads tokens from URL fragment
 *   2. Stores them in localStorage
 *   3. Checks if we came from Power Apps (has ?item_id= in the redirect)
 *   4. Navigates to dashboard or directly starts audit if item_id present
 *
 * Power Apps deep link flow:
 *   Power Apps → your site?item_id=68 → not logged in → Azure login →
 *   Azure → /auth/callback#tokens → /dashboard?item_id=68 → auto-start audit
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/services/api'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'processing' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    try {
      const result = authApi.handleCallback()
      if (!result) {
        setErrorMsg('No tokens in callback URL. Please try logging in again.')
        setStatus('error')
        return
      }

      // Check if there was an item_id before the redirect (stored before login)
      const pendingItemId = sessionStorage.getItem('pending_item_id')
      if (pendingItemId) {
        sessionStorage.removeItem('pending_item_id')
        router.push(`/dashboard?item_id=${pendingItemId}`)
      } else {
        router.push('/dashboard')
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Authentication failed')
      setStatus('error')
    }
  }, [router])

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl">✕</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Authentication Failed</h2>
          <p className="text-sm text-slate-500 mb-5">{errorMsg}</p>
          <button
            onClick={() => router.push('/auth/login')}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

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
