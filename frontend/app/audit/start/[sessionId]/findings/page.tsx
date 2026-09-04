'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/link'
import { Loader2, CheckCircle2, ExternalLink, AlertCircle, Save, FileText ,Upload } from 'lucide-react'
import { config } from '@/lib/config'
import { TokenStore } from '@/services/api'
import { useCurrentUser } from '@/hooks'

// ── Scoring framework (full 5 categories) ────────────────────────────────────
const FRAMEWORK = [
  {
    category: 'Scope & Business Alignment',
    subCategories: [
      'Problem Statement Clarity',
      'In-scope / Out-scope defined',
      'Assumptions & Dependencies',
    ],
  },
  {
    category: 'Financials & Effort Estimation',
    subCategories: [
      'Work Load Buildup',
      'Billing Rate',
      'Contingency',
    ],
  },
  {
    category: 'Architecture Plan',
    subCategories: [
      'Architecture Standardization',
      'Requirements',
      'Architecture optimization',
    ],
  },
  {
    category: 'Delivery Plan & Execution Readiness',
    subCategories: [
      'Project roadmap',
      'External dependencies',
      'Resource Allocation',
    ],
  },
  {
    category: 'Communication & Governance',
    subCategories: [
      'Governance Model',
      'Status reporting',
      'Client communication',
    ],
  },
]

// ── Types ─────────────────────────────────────────────────────────────────────
interface SubScore {
  sub_category: string
  upload_score: number    // auditor-entered score 0–5
  applicable: boolean     // whether this sub-category applies
  ai_score: number | null
}

interface CategoryState {
  category: string
  sub_scores: SubScore[]
  remarks: string
}

function buildInitial(): CategoryState[] {
  return FRAMEWORK.map(f => ({
    category: f.category,
    remarks: '',
    sub_scores: f.subCategories.map(sc => ({
      sub_category: sc,
      upload_score: 0,
      applicable: true,
      ai_score: null,
    })),
  }))
}

// ── Score input — "N / 5" style matching image 3 ──────────────────────────────
function ScoreInput({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={0} max={5} step={0.5}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Math.min(5, Math.max(0, parseFloat(e.target.value) || 0)))}
        className={`w-14 px-2 py-1.5 text-center text-[13px] border rounded focus:outline-none focus:ring-2 focus:ring-blue-400
          ${disabled ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
      />
      <span className="text-[13px] text-slate-500">/ 5</span>
    </div>
  )
}

// ── Category auto-calculated score ────────────────────────────────────────────
function catAutoScore(cat: CategoryState): number {
  const applicable = cat.sub_scores.filter(s => s.applicable)
  if (applicable.length === 0) return 0
  return applicable.reduce((sum, s) => sum + s.upload_score, 0) / applicable.length
}

// ── Overall score across all categories ──────────────────────────────────────
function overallScore(cats: CategoryState[]): number {
  if (cats.length === 0) return 0
  return cats.reduce((sum, c) => sum + catAutoScore(c), 0) / cats.length
}

// ── Score colour ──────────────────────────────────────────────────────────────
function scoreColor(s: number): string {
  if (s >= 4) return 'text-emerald-600'
  if (s >= 2.5) return 'text-amber-600'
  return 'text-red-600'
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UploadFindingsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const { data: currentUser } = useCurrentUser()

  const [categories, setCategories] = useState<CategoryState[]>(buildInitial())
  const [auditorName, setAuditorName]       = useState('')
  const [auditorEmail, setAuditorEmail]     = useState('')
  const [overallRemarks, setOverallRemarks] = useState('')
  const [aiReportUrl, setAiReportUrl]       = useState<string | null>(null)
  const [manualReport, setManualReport] = useState<File | null>(null)
  const [manualReportUrl, setManualReportUrl] = useState<string | null>(null)
  const [projectInfo, setProjectInfo]       = useState<{ client: string; project: string } | null>(null)

  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(true)

  // RBAC guard
  const canAccess = !currentUser || currentUser.role === 'admin' || currentUser.role === 'auditor'

  // Pre-fill auditor info from current user
  // useEffect(() => {
  //   if (currentUser) {
  //     setAuditorName(currentUser.name ?? '')
  //     setAuditorEmail(currentUser.email ?? currentUser.azure_email ?? '')
  //   }
  // }, [currentUser])

  // Load session detail (for project info + AI report URL + existing findings)
  useEffect(() => {
    if (!sessionId) return
    const loadAll = async () => {
      try {
        // Load session details
        const detailRes = await fetch(`${config.apiUrl}/polaris/audit/${sessionId}/details`, {
          headers: { Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
        })
        if (detailRes.ok) {
          const d = await detailRes.json()
          setProjectInfo({ client: d.client_name, project: d.project_name })
          setAiReportUrl(d.ai_audit_report_url ?? null)
          setManualReportUrl(
          d.summary_report_url ??
          d.summary_report_link ??
          null
        )
        }

        // Load existing findings
        const findingsRes = await fetch(`${config.apiUrl}/polaris/audit/${sessionId}/findings`, {
          headers: { Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
        })
        if (findingsRes.ok) {
          const f = await findingsRes.json()
          if (f?.categories?.length) {
            // Map existing findings onto our framework shape
            const mapped = buildInitial().map(catState => {
              const existing = f.categories.find((c: any) => c.category === catState.category)
              if (!existing) return catState
              return {
                ...catState,
                remarks: existing.remarks ?? '',
                sub_scores: catState.sub_scores.map(ss => {
                  const es = existing.scores?.find((s: any) => s.sub_category === ss.sub_category)
                  return es ? { ...ss, upload_score: es.manual_score ?? 0, applicable: es.applicable ?? true } : ss
                }),
              }
            })
            setCategories(mapped)
            setAuditorName(f.auditor_name ?? '')
            setAuditorEmail(f.auditor_email ?? '')
            setOverallRemarks(f.auditor_comments ?? '')
          }
        }
      } catch (_) { /* no existing findings — start fresh */ }
      finally { setLoadingExisting(false) }
    }
    loadAll()
  }, [sessionId])

  const updateSubScore = (catIdx: number, subIdx: number, field: 'upload_score' | 'applicable', value: any) => {
    setCategories(prev => prev.map((c, ci) =>
      ci === catIdx
        ? { ...c, sub_scores: c.sub_scores.map((s, si) => si === subIdx ? { ...s, [field]: value } : s) }
        : c
    ))
  }

  const updateRemarks = (catIdx: number, remarks: string) => {
    setCategories(prev => prev.map((c, ci) => ci === catIdx ? { ...c, remarks } : c))
  }

  const handleSave = async () => {
    setError(null)

    if (!overallRemarks.trim()) {
      setError('Overall Remarks is required.')
      return
    }

    setSaving(true)

    try {
      // Keep your existing categories structure
      const catsPayload = categories.map(c => ({
        category: c.category,
        remarks: c.remarks,
        scores: c.sub_scores.map(s => ({
          sub_category: s.sub_category,
          manual_score: s.upload_score,
          applicable: s.applicable,
          ai_score: s.ai_score,
        })),
      }))

      // Use FormData because we may also send the manual report file
      const fd = new FormData()

      if (auditorName) {
        fd.append('auditor_name', auditorName)
      }

      if (auditorEmail) {
        fd.append('auditor_email', auditorEmail)
      }

      fd.append('auditor_comments', overallRemarks)

      fd.append(
        'overall_score',
        String(overallScore(categories))
      )

      // Backend expects categories as a JSON string
      fd.append(
        'categories',
        JSON.stringify(catsPayload)
      )

      // NEW: attach manual audit report if selected
      if (manualReport) {
        fd.append('manual_report', manualReport)
      }

      const res = await fetch(
        `${config.apiUrl}/polaris/audit/${sessionId}/findings`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${TokenStore.getAccess() ?? ''}`,
          },

          // IMPORTANT:
          // Do NOT set Content-Type manually.
          // Browser automatically sets multipart/form-data
          // with the required boundary.
          body: fd,
        }
      )

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))

        throw new Error(
          (d as any).detail ?? `Error ${res.status}`
        )
      }

      setSaved(true)

      setTimeout(
        () => router.push(`/audit/history/${sessionId}`),
        1500
      )

    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!canAccess) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
          <AlertCircle size={40} className="text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-700">Access Restricted</h2>
          <p className="text-slate-500 text-sm">This page is only accessible to administrators and auditors.</p>
        </div>
      </AppShell>
    )
  }

  if (loadingExisting) return (
    <AppShell>
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 size={28} className="animate-spin text-blue-500" />
      </div>
    </AppShell>
  )

  if (saved) return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <CheckCircle2 size={52} className="text-emerald-500" />
        <h2 className="text-xl font-semibold text-slate-800">Findings saved successfully!</h2>
        <p className="text-slate-500 text-sm">Redirecting to audit detail…</p>
      </div>
    </AppShell>
  )

  const total = overallScore(categories)

  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <Link href="/audit/start" className="hover:text-blue-600">Start Audit</Link>
        {projectInfo && <><span>›</span><Link href={`/audit/start/${sessionId}`} className="hover:text-blue-600">{projectInfo.client}</Link></>}
        <span>›</span>
        <span className="text-slate-600">Upload Audit Findings</span>
      </div>

      {/* Title row + overall score badge — matches image 3 */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Upload Audit Findings</h1>
          <p className="text-[14px] text-slate-500 mt-0.5">Everything you need to understand and prepare for an audit</p>
        </div>
        {/* Overall score — top right badge matching image 3 */}
        <div className="flex-shrink-0 bg-white border-2 border-slate-200 rounded-xl px-5 py-3 text-center shadow-sm min-w-[110px]">
          <div className={`text-2xl font-bold tabular-nums ${scoreColor(total)}`}>
            {total.toFixed(1)}
            <span className="text-[15px] text-slate-400 font-normal"> / 5</span>
          </div>
          <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mt-0.5">Overall Score</div>
        </div>
      </div>

      {/* ── Main scoring table — matches image 3 ─────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            {/* Table header */}
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3 text-[12px] font-semibold text-slate-600 w-[190px]">Category</th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-slate-600 w-[200px]">Sub-Category</th>
                <th className="text-center px-4 py-3 text-[12px] font-semibold text-slate-600 w-[120px]">Upload Score</th>
                <th className="text-center px-4 py-3 text-[12px] font-semibold text-slate-600 w-[100px]">Applicable</th>
                <th className="text-center px-4 py-3 text-[12px] font-semibold text-slate-600 w-[150px]">Auto calculated Score</th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-slate-600">Remarks</th>
              </tr>
            </thead>

            <tbody>
              {categories.map((cat, ci) => {
                const auto = catAutoScore(cat)
                return cat.sub_scores.map((sub, si) => (
                  <tr key={`${cat.category}-${sub.sub_category}`}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40 transition-colors align-top">

                    {/* Category cell — rowspan */}
                    {si === 0 && (
                      <td rowSpan={cat.sub_scores.length}
                        className="px-5 py-4 border-r border-slate-100 align-top">
                        <span className="text-[13px] font-semibold text-slate-800 leading-snug block">
                          {cat.category}
                        </span>
                      </td>
                    )}

                    {/* Sub-category */}
                    <td className="px-4 py-3.5">
                      <span className={`text-[13px] ${sub.applicable ? 'text-blue-700' : 'text-slate-400 line-through'}`}>
                        {sub.sub_category}
                      </span>
                    </td>

                    {/* Upload Score input */}
                    <td className="px-4 py-3.5 text-center">
                      <ScoreInput
                        value={sub.upload_score}
                        disabled={!sub.applicable}
                        onChange={v => updateSubScore(ci, si, 'upload_score', v)}
                      />
                    </td>

                    {/* Applicable checkbox */}
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={sub.applicable}
                        onChange={e => updateSubScore(ci, si, 'applicable', e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>

                    {/* Auto Calculated Score — rowspan, shown once per category */}
                    {si === 0 && (
                      <td rowSpan={cat.sub_scores.length}
                        className="px-4 py-4 text-center border-l border-slate-100 align-middle">
                        <div className="flex items-center justify-center gap-1">
                          <span className={`text-[15px] font-bold tabular-nums ${scoreColor(auto)}`}>
                            {auto.toFixed(1)}
                          </span>
                          <span className="text-[13px] text-slate-400">/ 5</span>
                        </div>
                      </td>
                    )}

                    {/* Remarks — rowspan, shown once per category */}
                    {si === 0 && (
                      <td rowSpan={cat.sub_scores.length}
                        className="px-4 py-4 border-l border-slate-100 align-top">
                        <textarea
                          value={cat.remarks}
                          onChange={e => updateRemarks(ci, e.target.value)}
                          rows={Math.max(2, cat.sub_scores.length)}
                          placeholder="Enter category remarks here..."
                          className="w-full resize-none px-3 py-2 text-[12.5px] text-slate-600 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-300 font-[inherit] min-w-[160px]"
                        />
                      </td>
                    )}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overall Remarks — required, matches image 3 */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">
        <label className="flex items-center gap-1 text-[15px] font-bold text-slate-800 mb-3">
          <span className="text-red-500 text-base">*</span> Overall Remarks
        </label>
        <textarea
          value={overallRemarks}
          onChange={e => setOverallRemarks(e.target.value)}
          rows={5}
          placeholder="Enter text"
          className="w-full resize-y px-4 py-3 text-[13.5px] text-slate-700 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white placeholder:text-slate-400 font-[inherit]"
        />
      </div>

      {/* AI Audit Report section — replaces file upload, matches requirement */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">
        <h2 className="text-[15px] font-bold text-slate-800 mb-1">AI Audit Report</h2>
        <p className="text-[12.5px] text-slate-500 mb-4">
          The AI-generated audit report for this project is available below.
          Review it alongside your manual findings before saving.
        </p>
        {aiReportUrl ? (
          <a href={aiReportUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold rounded-lg transition-colors">
            <ExternalLink size={15} /> View AI Audit Report
          </a>
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-300" />
            AI Audit Report — Not Available for this session
          </div>
        )}
      </div>

      {/* Manual Audit Summary Report upload */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">
        <h2 className="text-[15px] font-bold text-slate-800 mb-1">
          Audit Summary Report
        </h2>

        <p className="text-[12.5px] text-slate-500 mb-4">
          Upload the manually prepared audit summary report. It will be stored in SharePoint under
          <span className="font-mono text-slate-600">
            {' '}Audit Summary / {'{'}STAR|DEX{'}'} /
          </span>
        </p>

        <label
          htmlFor="manual-report-upload"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold rounded-lg cursor-pointer transition-colors"
        >
          <Upload size={15} />

          {manualReport
            ? 'Change File'
            : manualReportUrl
              ? 'Replace Summary Report'
              : 'Upload Summary Report'}
        </label>

        <input
          id="manual-report-upload"
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={e => {
            setManualReport(e.target.files?.[0] ?? null)
          }}
        />

        {/* Newly selected file */}
        {manualReport && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-slate-600">
            <FileText size={15} className="text-blue-600" />

            <span className="font-medium">
              {manualReport.name}
            </span>

            <span className="text-slate-400 text-[11px]">
              ({(manualReport.size / 1024).toFixed(0)} KB)
            </span>

            <button
              onClick={() => setManualReport(null)}
              className="ml-1 text-slate-400 hover:text-red-500 text-[11px] underline"
            >
              remove
            </button>
          </div>
        )}

        {/* Existing SharePoint report */}
        {manualReportUrl && !manualReport && (
          <div className="mt-3 flex items-center gap-3">
            <FileText size={15} className="text-emerald-600" />

            <span className="text-[13px] text-slate-600">
              Audit Summary Report already uploaded
            </span>

            <a
              href={manualReportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
            >
              <ExternalLink size={13} />
              View Report
            </a>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-700">
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-[14px] font-semibold rounded-lg transition-colors">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving…' : 'Save Findings'}
        </button>
        <Link href={`/audit/start/${sessionId}`}
          className="text-[13px] text-slate-500 hover:text-slate-700 transition-colors">
          ← Back to project
        </Link>
      </div>
    </AppShell>
  )
}