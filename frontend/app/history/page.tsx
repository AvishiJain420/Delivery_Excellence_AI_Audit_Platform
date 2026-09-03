import { redirect } from 'next/navigation'
// The AI Audit History has moved to /ai-history
export default function HistoryRedirect() {
  redirect('/ai-audit/history')
}
