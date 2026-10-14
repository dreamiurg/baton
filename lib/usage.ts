import type { Usage } from './types.ts'

type Reading = { percent: number; resetsAt: string | null; asOf: number }
type Sample = { t: number; org: string; u?: { sd?: number } }

function parse<T>(text: string | null): T | null {
  if (text === null) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function pickUsage(input: {
  baton: string | null
  planHistory: string | null
  orgId: string | null
  limitReset: string | null
  now: number
  formatReset: (iso: string) => string
}): Usage | null {
  const reading = parse<Reading>(input.baton)
  if (reading && typeof reading.percent === 'number') {
    const isPastReset = reading.resetsAt !== null && Date.parse(reading.resetsAt) < input.now
    return {
      percent: isPastReset ? 0 : reading.percent,
      resetLabel: reading.resetsAt && !isPastReset ? input.formatReset(reading.resetsAt) : null,
      asOf: reading.asOf,
      source: 'baton',
    }
  }
  const samples = parse<{ samples?: Sample[] }>(input.planHistory)?.samples
  const newest = Array.isArray(samples)
    ? samples.filter(s => typeof s.u?.sd === 'number' && (!input.orgId || s.org === input.orgId)).sort((a, b) => b.t - a.t)[0]
    : undefined
  if (newest) return { percent: newest.u!.sd!, resetLabel: null, asOf: newest.t, source: 'desktop' }
  if (input.limitReset !== null) return { percent: 100, resetLabel: input.limitReset, asOf: input.now, source: 'limit-error' }
  return null
}

export function serializeReading(rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[], now: number): string | null {
  const week = rateLimits.find(r => r.kind === 'seven_day')
  return week ? JSON.stringify({ percent: week.percentUsed, resetsAt: week.resetsAt ?? null, asOf: now }) : null
}
