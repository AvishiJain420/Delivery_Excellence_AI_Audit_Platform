'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { authApi } from '@/services/api'

const PUBLIC_ROUTES = ['/auth/login', '/auth/callback']

function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r))

  useEffect(() => {
    if (isPublic) {
      setChecked(true)
      return
    }

    if (authApi.isLoggedIn()) {
      setChecked(true)
      return
    }

    // Save the full URL before redirecting to login.
    // callback/page.tsx reads this from sessionStorage after Microsoft auth.
    if (typeof window !== 'undefined') {
      const fullPath = window.location.pathname + window.location.search
      if (fullPath && fullPath !== '/' && !fullPath.startsWith('/auth')) {
        console.log('[AuthGuard] Saving return URL:', fullPath)
        sessionStorage.setItem('auth_return_url', fullPath)
      }
    }

    router.replace('/auth/login' as any)
  }, [isPublic, router])

  if (!isPublic && !checked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: 
      { 
        staleTime: 60_000, 
        retry: 1, 
        refetchOnWindowFocus: false,
        refetchOnMount:false
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard>
        {children}
      </AuthGuard>
    </QueryClientProvider>
  )
}