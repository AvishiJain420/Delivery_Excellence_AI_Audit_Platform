'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/services/api'
import { LoadingDots } from '@/components/ui/Spinner'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (authApi.isLoggedIn()) {
      setChecked(true)
      return
    }

    if (typeof window === 'undefined') {
      router.replace('/auth/login')
      return
    }

    const currentPath = window.location.pathname + window.location.search
    console.log('[AuthGuard] Current path:', currentPath)

    // CRITICAL FIX: use sessionStorage as a latch.
    // The FIRST AuthGuard to fire (on /audit?item_id=71) saves the URL.
    // Any subsequent AuthGuard (on /dashboard, /history etc) must NOT
    // overwrite it — the user's original destination is already saved.
    const alreadySaved = sessionStorage.getItem('auth_return_url')

    let loginUrl = '/auth/login'

    if (!currentPath.startsWith('/auth')) {
      if (!alreadySaved) {
        // First AuthGuard to fire — save this path
        sessionStorage.setItem('auth_return_url', currentPath)
        console.log('[AuthGuard] Saved return URL:', currentPath)
      } else {
        console.log('[AuthGuard] Return URL already saved as:', alreadySaved, '— not overwriting with:', currentPath)
      }

      // Always use the SAVED value (first one wins) as return_to
      const savedPath = sessionStorage.getItem('auth_return_url') ?? currentPath
      loginUrl = `/auth/login?return_to=${encodeURIComponent(savedPath)}`
    }

    console.log('[AuthGuard] Redirecting to:', loginUrl)
    router.replace(loginUrl as any)
  }, [router])

  if (!checked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingDots />
      </div>
    )
  }

  return <>{children}</>
}