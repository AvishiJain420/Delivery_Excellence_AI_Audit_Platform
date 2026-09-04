/**
 * lib/config.ts
 *
 * Centralized app configuration read from environment variables.
 * Never read process.env directly in components — import from here instead.
 */

export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  polarisUrl: process.env.NEXT_PUBLIC_POLARIS_URL ?? '',
  docs: {
    sampleDocuments:  process.env.NEXT_PUBLIC_SAMPLE_DOCUMENTS_URL  ?? '',
    auditOverview:    process.env.NEXT_PUBLIC_AUDIT_OVERVIEW_URL     ?? '',
    prerequisites:    process.env.NEXT_PUBLIC_PREREQUISITES_URL      ?? '',
    scoringRubric:    process.env.NEXT_PUBLIC_SCORING_RUBRIC_URL     ?? '',
    auditSchedule:    process.env.NEXT_PUBLIC_AUDIT_SCHEDULE_URL     ?? '',
    dexStarKnowledge: process.env.NEXT_PUBLIC_DEX_STAR_KNOWLEDGE_URL ?? '',
    leadershipSummary: process.env.NEXT_PUBLIC_LEADERSHIP_SUMMARY_URL ?? '',
    standardPractices: process.env.NEXT_PUBLIC_STANDARD_PRACTICES_URL ?? '',
    newsletters: process.env.NEXT_PUBLIC_NEWSLETTERS_URL ?? '',
  },
} as const

export function docLink(key: keyof typeof config.docs): string {
  return config.docs[key] || '#'
}
