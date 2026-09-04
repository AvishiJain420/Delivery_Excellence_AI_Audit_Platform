'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FileText,
  ExternalLink,
  Download,
  Loader2,
  RefreshCw,
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

export default function PastNewslettersPage() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadNewsletters() {
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

      // Backend returns newest-first.
      // First item is the current/latest newsletter.
      // Archive contains everything after it.
      setNewsletters(data.slice(1))
    } catch (err) {
      console.error(
        '[Past Newsletters] Failed to load newsletters:',
        err
      )

      setNewsletters([])
      setError(
        'Unable to load newsletters from SharePoint.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNewsletters()
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

        <Link
          href="/newsletters"
          className="hover:text-blue-600 transition-colors"
        >
          Newsletters
        </Link>

        <span>›</span>

        <span className="text-slate-600">
          Past Newsletters
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            Past Newsletters
          </h1>

          <p className="text-[14px] text-slate-500">
            Archived editions from previous months
          </p>
        </div>

        {/* Manual refresh */}
        {!loading && (
          <button
            type="button"
            onClick={loadNewsletters}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8 flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-400 text-[13px]">
            <Loader2
              size={16}
              className="animate-spin"
            />
            Loading newsletters…
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-white border border-red-200 rounded-lg shadow-sm p-6">
          <p className="text-[13px] text-red-500 mb-3">
            {error}
          </p>

          <button
            type="button"
            onClick={loadNewsletters}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-[12.5px] font-semibold transition-colors"
          >
            <RefreshCw size={13} />
            Try Again
          </button>
        </div>
      )}

      {/* Empty archive */}
      {!loading &&
        !error &&
        newsletters.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8 text-center">
            <FileText
              size={28}
              className="mx-auto text-slate-300 mb-3"
            />

            <p className="text-[14px] font-medium text-slate-600">
              No past newsletters available.
            </p>

            <p className="text-[12px] text-slate-400 mt-1">
              Older newsletter editions will appear here
              automatically when they are added to SharePoint.
            </p>
          </div>
        )}

      {/* Newsletter archive */}
      {!loading &&
        !error &&
        newsletters.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm max-w-4xl overflow-hidden">

            {newsletters.map((newsletter, index) => (
              <div
                key={`${newsletter.name}-${newsletter.last_modified}`}
                className={`flex items-center justify-between px-5 py-4 gap-4 ${
                  index < newsletters.length - 1
                    ? 'border-b border-slate-100'
                    : ''
                }`}
              >
                {/* File information */}
                <div className="flex items-center gap-3 min-w-0">

                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FileText
                      size={16}
                      className="text-blue-600"
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-slate-800 truncate">
                      {friendlyTitle(newsletter.name)}
                    </p>

                    <p className="text-[11.5px] text-slate-400 mt-0.5">
                      {fmtDate(newsletter.last_modified)}

                      {newsletter.size > 0 && (
                        <>
                          {' · '}
                          {fmtSize(newsletter.size)}
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">

                  {/* Open */}
                  {newsletter.web_url && (
                    <a
                      href={newsletter.web_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <ExternalLink size={11} />
                      View
                    </a>
                  )}

                  {/* Download */}
                  {newsletter.download_url && (
                    <a
                      href={newsletter.download_url}
                      download={newsletter.name}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <Download size={11} />
                      Download
                    </a>
                  )}

                </div>
              </div>
            ))}

          </div>
        )}

      {/* Count */}
      {!loading &&
        !error &&
        newsletters.length > 0 && (
          <p className="text-[11.5px] text-slate-400 mt-3">
            {newsletters.length}{' '}
            {newsletters.length === 1
              ? 'past newsletter'
              : 'past newsletters'}
          </p>
        )}
    </AppShell>
  )
}