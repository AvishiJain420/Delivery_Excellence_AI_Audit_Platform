'use client'

import { useState } from 'react'
import { X, FileText, AlertCircle } from 'lucide-react'
import { useStartAudit } from '@/hooks'
import { cn } from '@/lib/utils'

interface StartAuditModalProps {
  onClose: () => void
  defaultItemId ?: string 
}

export function StartAuditModal({ onClose }: StartAuditModalProps) {
  const [form, setForm] = useState({
    project_name: '',
    client_name: '',
    project_code: '',
  })

  const [error, setError] = useState('')

  const { manualMutation } = useStartAudit()

  const loading = manualMutation.isPending

  const handleSubmit = async () => {
    setError('')

    try {
      if (!form.project_name.trim()) {
        setError('Project name is required')
        return
      }

      if (!form.client_name.trim()) {
        setError('Client name is required')
        return
      }

      if (!form.project_code.trim()) {
        setError('Project code is required')
        return
      }

      await manualMutation.mutateAsync(form)

      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

        {/* Header */}

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Start New Audit
            </h2>

            <p className="text-xs text-slate-500 mt-0.5">
              Enter project details to begin the audit.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}

        <div className="px-6 py-5">

          <div className="flex items-center gap-2 mb-4 text-blue-600">
            <FileText size={18} />
            <span className="font-semibold">
              Project Information
            </span>
          </div>

          <div className="space-y-4">

            {[
              {
                key: 'project_name',
                label: 'Project Name',
                placeholder: 'e.g. Digital Transformation Initiative',
              },
              {
                key: 'client_name',
                label: 'Client Name',
                placeholder: 'e.g. Contoso Corp',
              },
              {
                key: 'project_code',
                label: 'Project Code',
                placeholder: 'e.g. PRJ-2024-001',
              },
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {field.label}
                  <span className="text-red-500"> *</span>
                </label>

                <input
                  type="text"
                  value={(form as any)[field.key]}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}

          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}

        </div>

        {/* Footer */}

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">

          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className={cn(
              'px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-sm transition-colors',
              loading
                ? 'opacity-70 cursor-not-allowed'
                : 'hover:bg-blue-700'
            )}
          >
            {loading ? 'Starting…' : 'Start Audit →'}
          </button>

        </div>

      </div>
    </div>
  )
}