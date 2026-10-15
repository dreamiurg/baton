import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupSessions, stalledOf } from '../../lib/grouping.ts'
import type { Session } from '../../lib/types.ts'

const NOW = new Date(2026, 9, 15, 12, 0).getTime()
const H = 3_600_000
let n = 0
const s = (o: Partial<Session>): Session => ({
  cliSessionId: `id${++n}`, title: `t${n}`, folder: 'app', branch: 'main', lastActivityAt: NOW - H, limitedAt: null, resetText: null,
  pr: null, model: '', tokensApprox: 1, transcriptPath: '/x', state: null, repo: 'app', customGroup: null, fromProject: false, createdAt: NOW - H, ...o,
})
const names = (gs: { name: string; sessions: Session[] }[]) => gs.map(g => `${g.name}:${g.sessions.map(x => x.title).join(',')}`)
const base = { sort: 'recent' as const, showThreads: false, customGroups: ['Product', 'Security'], now: NOW }

const list = [
  s({ title: 'limited', limitedAt: NOW - 2 * H, lastActivityAt: NOW - 2 * H, customGroup: 'Security' }),
  s({ title: 'blocked', state: 'blocked', lastActivityAt: NOW - 30 * H, repo: 'web', customGroup: 'Product' }),
  s({ title: 'done', state: 'completed', lastActivityAt: NOW - 5 * 24 * H, createdAt: NOW }),
  s({ title: 'other', lastActivityAt: NOW - 20 * 24 * H, repo: 'web' }),
  s({ title: 'thread', fromProject: true, limitedAt: NOW - H, state: 'blocked' }),
]

test('state grouping: limit, needs you, done, other; project threads hidden by default', () => {
  assert.deepEqual(names(groupSessions(list, { ...base, by: 'state' })), ['Hit weekly limit:limited', 'Needs you:blocked', 'Done:done', 'Other:other'])
})

test('date grouping uses calendar days', () => {
  assert.deepEqual(names(groupSessions(list, { ...base, by: 'date' })), ['Today:limited', 'Yesterday:blocked', 'This week:done', 'Older:other'])
})

test('project grouping is by repo, largest first; custom follows the source order then Ungrouped', () => {
  assert.deepEqual(names(groupSessions(list, { ...base, by: 'project' })), ['app:limited,done', 'web:blocked,other'])
  assert.deepEqual(names(groupSessions(list, { ...base, by: 'custom' })), ['Product:blocked', 'Security:limited', 'Ungrouped:done,other'])
})

test('sort applies inside groups and shown threads get their own last group', () => {
  const g = groupSessions(list, { ...base, by: 'none', sort: 'created', showThreads: true })
  assert.deepEqual(g.map(x => x.name), ['All sessions', 'From claude.ai Projects'])
  assert.equal(g[0]!.sessions[0]!.title, 'done')
  assert.deepEqual(g[1]!.sessions.map(x => x.title), ['thread'])
})

test('stalledOf never counts project threads', () => {
  assert.deepEqual(stalledOf(list).map(x => x.title), ['limited'])
})

test('a custom group named Ungrouped stays separate from unassigned sessions', () => {
  const gs = groupSessions([s({ title: 'named', customGroup: 'Ungrouped' }), s({ title: 'none' })], { ...base, by: 'custom', customGroups: ['Ungrouped'] })
  assert.equal(gs.length, 2)
  assert.notEqual(gs[0]!.id, gs[1]!.id)
  assert.deepEqual(gs.map(g => g.sessions.map(x => x.title)), [['named'], ['none']])
})
