'use client'
import { useState } from 'react'
import { authApi } from '@/services/api'
import { Bot, Shield } from 'lucide-react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      // Pass /dashboard as return_to — the real destination
      // is saved in sessionStorage by layout AuthGuard and
      // read by callback/page.tsx after Microsoft login.
      const url = await authApi.getLoginUrl('/dashboard')
      window.location.href = url
    } catch (e: any) {
      setError(e.message ?? 'Failed to connect to authentication service')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Bot className="text-white w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-white">Polaris</h1>
          <p className="text-blue-300/80 text-sm mt-1">AI Document Audit Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Sign in</h2>
          <p className="text-sm text-slate-500 mb-6">
            Use your organisation Microsoft account to sign in securely.
          </p>

          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
              </svg>
            )}
            {loading ? 'Redirecting to Microsoft…' : 'Sign in with Microsoft'}
          </button>

          <div className="mt-5 flex items-center gap-2 text-xs text-slate-400">
            <Shield size={12} />
            <span>Protected by Azure Active Directory with MFA</span>
          </div>
        </div>

        <p className="text-center text-blue-300/50 text-xs mt-6">
          Only organisation members can access this platform
        </p>
      </div>
    </div>
  )
}