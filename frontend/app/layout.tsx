'use client'
import './globals.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { authApi } from '@/services/api'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  const publicRoutes = ['/auth/login', '/auth/callback']
  const isPublic = publicRoutes.some(r => pathname.startsWith(r))

  useEffect(() => {
    if (!isPublic && !authApi.isLoggedIn()) {
      // Store the current path so we can return after login
      if (typeof window !== 'undefined' && pathname.includes('item_id')) {
        const params = new URLSearchParams(window.location.search)
        const itemId = params.get('item_id')
        if (itemId) sessionStorage.setItem('pending_item_id', itemId)
      }
      router.replace('/auth/login')
    } else {
      setChecked(true)
    }
  }, [pathname, isPublic, router])

  if (!isPublic && !checked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>

}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000, retry: 1 ,refetchOnWindowFocus:false} },
  }))

  return (
    <html lang="en">
      <head>
        <title>Polaris - Document Audit Platform</title>
        <meta name="description" content="Enterprise Document Audit Platform powered by AI" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="font-sans">
        <QueryClientProvider client={queryClient}>
          <AuthGuard>
            {children}
          </AuthGuard>
        </QueryClientProvider>
      </body>
    </html>
  )
}
