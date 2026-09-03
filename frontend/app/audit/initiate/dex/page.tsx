'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/dist/client/link'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { config } from '@/lib/config'
import { TokenStore } from '@/services/api'

function Field({ label, required, fullWidth, children }: {
  label: string; required?: boolean; fullWidth?: boolean; children: React.ReactNode
}) {
  return (
    <div
      className="flex flex-col gap-1.5"
      style={{
        minWidth: '220px',
        flex: fullWidth ? '1 1 100%' : '1 1 calc(50% - 15px)',
      }}
    >
      <label className="text-[13px] font-semibold text-slate-700">
        {required && <span className="text-rose-600 mr-0.5">*</span>}
        {label}
      </label>
      {children}
    </div>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`px-2.5 py-2 text-[13.5px] border border-slate-400 rounded text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 ${props.className ?? ''}`}
    />
  )
}

export default function InitiateDexAuditPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    client_name: '',
    project_name: '',
    project_code: '',
    project_manager: '',
    sow_signed_date: '',
    phase: '',
    project_start_date: '',
    project_end_date: '',
    actual_project_start_date: '',
    estimated_project_end_date: '',
    project_duration_months: '',
    project_duration_weeks: '',
    estimated_budget: '',
    consumed_budget: '',
    current_project_margin: '',
    sharepoint_link: '',
    project_details: '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const required = ['client_name', 'project_name', 'project_code', 'project_manager',
      'sow_signed_date', 'actual_project_start_date', 'estimated_project_end_date',
      'estimated_budget', 'sharepoint_link'] as const

    const missing = required.filter(k => !form[k])
    if (missing.length > 0) {
      setError('Please fill in all required fields.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${config.apiUrl}/polaris/audit/dex`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TokenStore.getAccess() ?? ''}`,
        },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? `Error ${res.status}`)
      }

      const data = await res.json()
      setSuccess(true)
      setTimeout(() => router.push(`/audit/start/${data.session_id}`), 1500)
    } catch (err: any) {
      setError(err.message ?? 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <CheckCircle2 size={52} className="text-green-500" />
          <h2 className="text-xl font-semibold text-slate-800">DEX audit request submitted!</h2>
          <p className="text-slate-500 text-sm">Redirecting to project details…</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <Link href="/audit/initiate" className="hover:text-blue-600">Initiate New Audit</Link>
        <span>›</span>
        <span className="text-slate-600">DEX Audit</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Initiate New DEX Audit</h1>
      <p className="text-[14px] text-slate-500 mb-6">
        Upload your project documents for AI-powered review before requesting a formal audit.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm max-w-5xl">
          <h2 className="text-[17px] font-semibold text-slate-800 mb-1">
            Step 1: Project details and document upload
          </h2>
          <p className="text-[13px] text-slate-500 mb-6">
            Provide the project information and upload your supporting documents.
          </p>

          <div className="flex flex-wrap gap-5">
            <Field label="Client Name" required>
              <Input placeholder="e.g. Sanofi" value={form.client_name} onChange={e => set('client_name', e.target.value)} />
            </Field>
            <Field label="Project Name" required>
              <Input value={form.project_name} onChange={e => set('project_name', e.target.value)} />
            </Field>

            <Field label="Project Code" required>
              <Input value={form.project_code} onChange={e => set('project_code', e.target.value)} />
            </Field>
            <Field label="Project Manager" required>
              <Input value={form.project_manager} onChange={e => set('project_manager', e.target.value)} />
            </Field>

            <Field label="SOW Signed Date" required>
              <Input type="date" value={form.sow_signed_date} onChange={e => set('sow_signed_date', e.target.value)} />
            </Field>
            <Field label="Phase">
              <Input value={form.phase} onChange={e => set('phase', e.target.value)} />
            </Field>

            <Field label="Project Start Date (as per SOW)">
              <Input type="date" value={form.project_start_date} onChange={e => set('project_start_date', e.target.value)} />
            </Field>
            <Field label="Project End Date (as per SOW)">
              <Input type="date" value={form.project_end_date} onChange={e => set('project_end_date', e.target.value)} />
            </Field>

            <Field label="Actual Project Start Date" required>
              <Input type="date" value={form.actual_project_start_date} onChange={e => set('actual_project_start_date', e.target.value)} />
            </Field>
            <Field label="Estimated Project End Date" required>
              <Input type="date" value={form.estimated_project_end_date} onChange={e => set('estimated_project_end_date', e.target.value)} />
            </Field>

            <Field label="Project Duration (in months)">
              <Input type="number" min="0" value={form.project_duration_months} onChange={e => set('project_duration_months', e.target.value)} />
            </Field>
            <Field label="Project Duration (in weeks)">
              <Input type="number" min="0" value={form.project_duration_weeks} onChange={e => set('project_duration_weeks', e.target.value)} />
            </Field>

            <Field label="Estimated Budget as per SOW ($)" required>
              <Input placeholder="e.g. $250,000" value={form.estimated_budget} onChange={e => set('estimated_budget', e.target.value)} />
            </Field>
            <Field label="Consumed Budget (Till Date) ($)">
              <Input value={form.consumed_budget} onChange={e => set('consumed_budget', e.target.value)} />
            </Field>

            <Field label="Current Project Margin (%)">
              <Input type="number" min="0" max="100" value={form.current_project_margin} onChange={e => set('current_project_margin', e.target.value)} />
            </Field>
            <Field label="ProcDNA Project Document SharePoint Link" required>
              <Input
                placeholder="https://procdna.sharepoint.com/..."
                value={form.sharepoint_link}
                onChange={e => set('sharepoint_link', e.target.value)}
              />
            </Field>

            <Field label="Project Details" fullWidth>
              <textarea
                rows={3}
                value={form.project_details}
                onChange={e => set('project_details', e.target.value)}
                className="px-2.5 py-2 text-[13.5px] border border-slate-400 rounded text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-[inherit]"
              />
            </Field>
          </div>

          {error && (
            <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-[13px] text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Link
              href="/audit/initiate/dex/next"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold rounded transition-colors"
            >
              Next
            </Link>
            <Link href="/audit/initiate" className="text-[13px] text-slate-500 hover:text-slate-700">
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </AppShell>
  )
}