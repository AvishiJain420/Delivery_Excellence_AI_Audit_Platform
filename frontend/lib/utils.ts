import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return d.toLocaleDateString()
}

export function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Maps backend WS stage names to UI pipeline step IDs
export const STAGE_TO_STEP: Record<string, string> = {
  fetching: 's1', project_loaded: 's2', identifying: 's3',
  validation_required: 's4', identified: 's4',
  parsing: 's5', parsed: 's5',
  auditing: 's6', audited: 's6',
  summarising: 's7', summarised: 's7',
  exporting: 's8', uploading: 's8', done: 's9',
}

// The 9 pipeline steps shown in AuditTimeline
export const PIPELINE_STEPS = [
  { id: 's1', label: 'Request\nReceived',  description: 'Audit request received' },
  { id: 's2', label: 'SharePoint',         description: 'Fetching project details' },
  { id: 's3', label: 'Identifying',        description: 'AI identifying documents' },
  { id: 's4', label: 'Validation',         description: 'User confirms document mapping' },
  { id: 's5', label: 'Parsing',            description: 'Parsing document content' },
  { id: 's6', label: 'AI Evaluation',      description: 'Running AI audit' },
  { id: 's7', label: 'Summary',            description: 'Generating combined summary' },
  { id: 's8', label: 'Report',             description: 'Exporting & uploading report' },
  { id: 's9', label: 'Complete',           description: 'Audit complete' },
]

export function scoreColor(score?: number): string {
  if (score == null) return 'text-slate-400'
  if (score >= 80) return 'text-emerald-600 font-bold'
  if (score >= 60) return 'text-amber-600 font-bold'
  return 'text-red-600 font-bold'
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pending', fetching: 'Fetching', identifying: 'Identifying',
    parsing: 'Parsing', auditing: 'Auditing', summarising: 'Summarising',
    exporting: 'Exporting', uploading: 'Uploading', done: 'Completed',
    failed: 'Failed', completed: 'Completed', running: 'Running',
  }
  return map[status] ?? status
}
