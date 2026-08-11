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
} as const