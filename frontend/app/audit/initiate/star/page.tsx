'use client'
import { useState, useRef, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import Link from 'next/dist/client/link'
import { Upload, X, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import { config } from '@/lib/config'
import { TokenStore } from '@/services/api'

// ── Shared field components ────────────────────────────────────────────────────
function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 flex-1" style={{ minWidth: '220px', flexBasis: 'calc(50% - 15px)' }}>
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
      className={`px-2.5 py-2 text-[13.5px] border border-slate-400 rounded text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400 ${props.className ?? ''}`}
    />
  )
}

function Select({
  children, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className="px-2.5 py-2 text-[13.5px] border border-slate-400 rounded text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {children}
    </select>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function InitiateStarAuditPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [form, setForm] = useState({
    client_name: '',
    project_name: '',
    project_manager: '',
    estimated_sow_signed_date: '',
    project_start_date: '',
    project_end_date: '',
    project_duration_months: '',
    project_duration_weeks: '',
    estimated_budget: '',
    estimated_project_margin: '',
    discount_provided: '',
    discount_percentage: '',
    discount_approver_email: '',
    project_details: '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      const next = [...prev]
      for (const f of Array.from(incoming)) {
        if (!existing.has(f.name)) next.push(f)
      }
      return next
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  const removeFile = (name: string) =>
    setFiles(prev => prev.filter(f => f.name !== name))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // Basic validation
    if (!form.client_name || !form.project_name || !form.project_manager || !form.estimated_budget) {
      setError('Please fill in all required fields.')
      return
    }
    if (files.length === 0) {
      setError('Please upload at least one document.')
      return
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v) })
      files.forEach(f => fd.append('files', f))

      const res = await fetch(`${config.apiUrl}/polaris/audit/star`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
        body: fd,
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
          <h2 className="text-xl font-semibold text-slate-800">Audit request submitted!</h2>
          <p className="text-slate-500 text-sm">Redirecting to project details…</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-4">
        <Link href="/home" className="hover:text-blue-600">Home</Link>
        <span>›</span>
        <Link href="/audit/initiate" className="hover:text-blue-600">Initiate New Audit</Link>
        <span>›</span>
        <span className="text-slate-600">STAR Audit</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Initiate New STAR Audit</h1>
      <p className="text-[14px] text-slate-500 mb-6">
        Upload your project documents for requesting a formal audit.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm max-w-5xl">
          <h2 className="text-[17px] font-semibold text-slate-800 mb-1">
            Step 1: Project details and document upload
          </h2>
          <p className="text-[13px] text-slate-500 mb-6">
            Provide the project information and upload your supporting documents for a formal audit.
          </p>

          {/* Form grid */}
          <div className="flex flex-wrap gap-5">
            <Field label="Client Name" required>
              <Input placeholder="e.g. Sanofi" value={form.client_name} onChange={e => set('client_name', e.target.value)} />
            </Field>
            <Field label="Project Name" required>
              <Input value={form.project_name} onChange={e => set('project_name', e.target.value)} />
            </Field>

            <Field label="Project Manager" required>
              <Input value={form.project_manager} onChange={e => set('project_manager', e.target.value)} />
            </Field>
            <Field label="Estimated SOW Signed Date">
              <Input type="date" value={form.estimated_sow_signed_date} onChange={e => set('estimated_sow_signed_date', e.target.value)} />
            </Field>

            <Field label="Project Start Date (as per SOW)">
              <Input type="date" value={form.project_start_date} onChange={e => set('project_start_date', e.target.value)} />
            </Field>
            <Field label="Project End Date (as per SOW)">
              <Input type="date" value={form.project_end_date} onChange={e => set('project_end_date', e.target.value)} />
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
            <Field label="Estimated Project Margin (%)">
              <Input type="number" min="0" max="100" value={form.estimated_project_margin} onChange={e => set('estimated_project_margin', e.target.value)} />
            </Field>

            <Field label="Discount Provided?">
              <Select value={form.discount_provided} onChange={e => set('discount_provided', e.target.value)}>
                <option value="">— Select —</option>
                <option>Yes</option>
                <option>No</option>
              </Select>
            </Field>
            <Field label="Discount (%)">
              <Input type="number" min="0" max="100" value={form.discount_percentage}
                disabled={form.discount_provided !== 'Yes'}
                onChange={e => set('discount_percentage', e.target.value)}
                className={form.discount_provided !== 'Yes' ? 'opacity-50' : ''} />
            </Field>

            <Field label="Discount Approver's Email">
              <Input type="email" value={form.discount_approver_email}
                disabled={form.discount_provided !== 'Yes'}
                onChange={e => set('discount_approver_email', e.target.value)}
                className={form.discount_provided !== 'Yes' ? 'opacity-50' : ''} />
            </Field>

            {/* Full-width project details */}
            <div className="w-full flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Project Details</label>
              <textarea
                rows={3}
                value={form.project_details}
                onChange={e => set('project_details', e.target.value)}
                className="px-2.5 py-2 text-[13.5px] border border-slate-400 rounded text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-[inherit]"
              />
            </div>

            {/* Upload box */}
            <div className="w-full">
              <label className="text-[13px] font-semibold text-slate-700 block mb-1.5">
                <span className="text-rose-600 mr-0.5">*</span>
                Upload Documents{' '}
                <span className="text-slate-400 font-normal italic text-[12px]">
                  (Note: attach the discount approval email along with the project documents)
                </span>
              </label>

              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-[1.5px] border-dashed border-slate-300 rounded p-8 text-center text-slate-500 text-[13.5px] bg-slate-50 cursor-pointer hover:border-blue-400 hover:bg-blue-50/20 transition-colors"
              >
                <Upload size={22} className="mx-auto mb-2 text-slate-400" />
                <span>Drag &amp; drop files here, or click to browse</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.docx,.pptx,.xlsx,.doc,.ppt,.xls"
                  onChange={e => handleFiles(e.target.files)}
                />
              </div>

              {files.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {files.map(f => (
                    <div key={f.name} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-[12.5px]">
                      <FileText size={14} className="text-blue-500 flex-shrink-0" />
                      <span className="flex-1 truncate text-slate-700">{f.name}</span>
                      <span className="text-slate-400 text-[11px]">{(f.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => removeFile(f.name)} className="text-slate-400 hover:text-red-500">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-[13px] text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center gap-3">
            <Link
              href="/audit/initiate/star/next"
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