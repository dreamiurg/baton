import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickUsage, serializeReading } from '../../lib/usage.ts'

const base = { baton: null, planHistory: null, orgId: 'org-a', limitReset: null, now: 1_000_000, formatReset: (iso: string) => `fmt(${iso})` }
const history = JSON.stringify({ version: 2, samples: [
  { t: 10, org: 'org-a', u: { fh: 5, sd: 40 } },
  { t: 30, org: 'org-b', u: { fh: 5, sd: 99 } },
  { t: 20, org: 'org-a', u: { fh: 5, sd: 62 } },
] })

test('baton reading wins and formats the reset', () => {
  const baton = JSON.stringify({ percent: 12, resetsAt: '2026-10-17T03:00:00Z', asOf: 900_000 })
  assert.deepEqual(pickUsage({ ...base, baton, planHistory: history }), { percent: 12, resetLabel: 'fmt(2026-10-17T03:00:00Z)', asOf: 900_000, source: 'baton' })
})

test('a reading from before its reset shows 0%', () => {
  const baton = JSON.stringify({ percent: 100, resetsAt: '1970-01-01T00:00:01Z', asOf: 500 })
  assert.equal(pickUsage({ ...base, baton })!.percent, 0)
})

test('falls back to the newest Desktop sample for the org', () => {
  assert.deepEqual(pickUsage({ ...base, planHistory: history }), { percent: 62, resetLabel: null, asOf: 20, source: 'desktop' })
})

test('then to the limit error, then to nothing', () => {
  assert.deepEqual(pickUsage({ ...base, limitReset: '1am (America/Los_Angeles)' }), { percent: 100, resetLabel: '1am (America/Los_Angeles)', asOf: 1_000_000, source: 'limit-error' })
  assert.equal(pickUsage(base), null)
  assert.equal(pickUsage({ ...base, baton: '{not json', planHistory: '[]' }), null)
})

test('serializeReading keeps the seven_day window only', () => {
  assert.equal(serializeReading([{ kind: 'five_hour', percentUsed: 3 }], 5), null)
  assert.deepEqual(JSON.parse(serializeReading([{ kind: 'seven_day', percentUsed: 23.5, resetsAt: 'R' }], 5)!), { percent: 23.5, resetsAt: 'R', asOf: 5 })
})
