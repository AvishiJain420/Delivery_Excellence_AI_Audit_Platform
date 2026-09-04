'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Newspaper,
  Archive,
  ChevronRight,
  FileText,
  ExternalLink,
  Loader2,
  Download,
} from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { config } from '@/lib/config'
import { TokenStore } from '@/services/api'

interface Newsletter {
  name: string
  web_url: string
  download_url: string
  last_modified: string
  size: number
}

function friendlyTitle(name: string): string {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function fmtDate(iso: string): string {
  if (!iso) return ''

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtSize(bytes: number): string {
  if (!bytes || bytes <= 0) return ''

  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function NewslettersPage() {
  const [latest, setLatest] = useState<Newsletter | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadLatestNewsletter() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(
          `${config.apiUrl}/polaris/newsletters`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${TokenStore.getAccess() ?? ''}`,
            },
            cache: 'no-store',
          }
        )

        if (!response.ok) {
          throw new Error(
            `Failed to fetch newsletters (${response.status})`
          )
        }

        const data: Newsletter[] = await response.json()

        if (cancelled) return

        // Backend already sorts SharePoint files newest-first.
        setLatest(data.length > 0 ? data[0] : null)
      } catch (err) {
        if (cancelled) return

        console.error('[Newsletters] Failed to load latest newsletter:', err)

        setLatest(null)
        setError(
          'Unable to load newsletters from SharePoint.'
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadLatestNewsletter()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link
          href="/home"
          className="hover:text-blue-600 transition-colors"
        >
          Home
        </Link>

        <span>›</span>

        <span className="text-slate-600">
          Newsletters
        </span>
      </div>

      {/* Header */}
      <h1 className="text-2xl font-bold text-slate-900 mb-1">
        Newsletters
      </h1>

      <p className="text-[14px] text-slate-500 mb-7">
        Stay up to date with the latest Delivery Excellence insights
      </p>

      {/* Cards */}
      <div className="flex gap-5 flex-wrap">

        {/* ─────────────────────────────────────────────
            Latest Newsletter
        ───────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col gap-3 flex-1 min-w-[280px] max-w-[420px] shadow-sm">

          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <Newspaper
              size={20}
              className="text-blue-600"
            />
          </div>

          <h3 className="text-[16px] font-semibold text-slate-900">
            Latest Newsletter
          </h3>

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-[13px]">
              <Loader2
                size={14}
                className="animate-spin"
              />
              Loading newsletter…
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="text-[13px] text-red-500 leading-relaxed">
              {error}
            </div>
          )}

          {/* Newsletter */}
          {!loading && !error && latest && (
            <>
              <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-lg border border-slate-100">

                <FileText
                  size={16}
                  className="text-blue-500 flex-shrink-0 mt-0.5"
                />

                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 truncate">
                    {friendlyTitle(latest.name)}
                  </p>

                  <p className="text-[11.5px] text-slate-400 mt-0.5">
                    {fmtDate(latest.last_modified)}
                    {latest.size > 0 && (
                      <>
                        {' · '}
                        {fmtSize(latest.size)}
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">

                {/* Open SharePoint document */}
                {latest.web_url && (
                  <a
                    href={latest.web_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors"
                  >
                    <ExternalLink size={13} />
                    Read Now
                  </a>
                )}

                {/* Download */}
                {latest.download_url && (
                  <a
                    href={latest.download_url}
                    download={latest.name}
                    className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 text-[13px] font-semibold rounded-lg transition-colors"
                  >
                    <Download size={13} />
                    Download
                  </a>
                )}

              </div>
            </>
          )}

          {/* Empty SharePoint folder */}
          {!loading && !error && !latest && (
            <p className="text-[13px] text-slate-400 italic">
              No newsletters are currently available.
            </p>
          )}
        </div>

        {/* ─────────────────────────────────────────────
            Past Newsletters
        ───────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col gap-3 flex-1 min-w-[280px] max-w-[420px] shadow-sm">

          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <Archive
              size={20}
              className="text-slate-600"
            />
          </div>

          <h3 className="text-[16px] font-semibold text-slate-900">
            Past Newsletters
          </h3>

          <p className="text-[13px] text-slate-500 leading-relaxed flex-1">
            Browse all previous editions of the Delivery Excellence
            newsletter archive.
          </p>

          <Link
            href="/newsletters/past"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-white text-[13px] font-semibold rounded-lg transition-colors self-start"
          >
            View Archive
            <ChevronRight size={13} />
          </Link>
        </div>

      </div>
    </AppShell>
  )
}