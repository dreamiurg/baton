import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadProfiles, modelLabel, projectDirName, prLabel, readSessions } from '../../lib/profiles.ts'
import type { Self } from '../../lib/types.ts'
import { memFs } from './memfs.ts'

const HOME = '/Users/u'
const AS = `${HOME}/Library/Application Support`
const rec = (o: Record<string, unknown>) => JSON.stringify({ isArchived: false, model: 'claude-opus-5-5', ...o })
const tx = (cwd: string, id: string) => `${HOME}/.claude/projects/${projectDirName(cwd)}/${id}.jsonl`

function fixture() {
  return memFs({
    [`${AS}/Claude/claude-code-sessions/acct-a/org-a/local_1.json`]: rec({ cliSessionId: 'aaa', title: 'Fix login', originCwd: '/r/app', cwd: '/r/app', branch: 'main', lastActivityAt: 100, error: "You've hit your weekly limit · resets 1am (America/Los_Angeles)", errorAt: 90, prs: [{ prNumber: 41, state: 'OPEN' }] }),
    [`${AS}/Claude/claude-code-sessions/acct-a/org-a/local_2.json`]: rec({ cliSessionId: 'bbb', title: 'Old idea', originCwd: '/r/app', cwd: '/r/app', lastActivityAt: 300 }),
    [`${AS}/Claude/claude-code-sessions/acct-a/org-a/local_3.json`]: rec({ cliSessionId: 'ccc', title: 'Archived', originCwd: '/r/app', isArchived: true, lastActivityAt: 400 }),
    [`${AS}/Claude/claude-code-sessions/acct-a/org-a/local_4.json`]: rec({ cliSessionId: 'ddd', title: 'Gone transcript', originCwd: '/r/gone', lastActivityAt: 500 }),
    [`${AS}/Claude/claude-code-sessions/acct-a/org-a/local_5.json`]: '{"cliSessionId":"eee","title":"half-writ',
    [`${AS}/Claude/claude-code-sessions/acct-a/org-a/local_6.json`]: rec({ cliSessionId: 'fff', title: 'Second stalled', originCwd: '/r/app', lastActivityAt: 200, error: "You've hit your weekly limit · resets 1am", errorAt: 150 }),
    [`${AS}/Claude/claude-code-sessions/acct-a/org-a/scheduled-tasks.json`]: '{}',
    [tx('/r/app', 'aaa')]: 'x'.repeat(4000),
    [tx('/r/app', 'bbb')]: 'x',
    [tx('/r/app', 'ccc')]: 'x',
    [tx('/r/app', 'fff')]: 'x',
    [`${AS}/Claude-Work/claude-code-sessions/acct-b/org-b/local_9.json`]: rec({ cliSessionId: 'zzz', title: 'Work thing', originCwd: '/w', lastActivityAt: 50 }),
    [tx('/w', 'zzz')]: 'x',
    [`${AS}/Claude Extensions/readme.txt`]: 'not a profile',
    [`${HOME}/.config/baton/config.json`]: JSON.stringify({ profiles: { Claude: { label: 'Personal', email: 'me@example.com' } } }),
  })
}

test('projectDirName replaces every non-alphanumeric character', () => {
  assert.equal(projectDirName('/Users/u/src/calle/.claude/worktrees/x_y'), '-Users-u-src-calle--claude-worktrees-x-y')
})

test('modelLabel and prLabel', () => {
  assert.equal(modelLabel('claude-opus-5-5'), 'Opus 5.5')
  assert.equal(modelLabel('claude-fable-5-1'), 'Fable 5.1')
  assert.equal(modelLabel('something-else'), 'something-else')
  assert.equal(prLabel({ prs: [{ prNumber: 3, state: 'MERGED' }, { prNumber: 41, state: 'OPEN' }] }), '#41 open')
  assert.equal(prLabel({ prNumber: 7, prState: 'CLOSED' }), '#7 closed')
  assert.equal(prLabel({}), null)
})

test('readSessions keeps live records with a transcript, stalled first', async () => {
  const { sessions, orgId } = await readSessions(fixture(), HOME, `${AS}/Claude`)
  assert.deepEqual(sessions.map(s => s.cliSessionId), ['fff', 'aaa', 'bbb'])
  const a = sessions.find(s => s.cliSessionId === 'aaa')!
  assert.equal(a.limitedAt, 90)
  assert.equal(a.resetText, '1am (America/Los_Angeles)')
  assert.equal(a.pr, '#41 open')
  assert.equal(a.model, 'Opus 5.5')
  assert.equal(a.folder, 'app')
  assert.equal(a.tokensApprox, 1000)
  assert.equal(orgId, 'org-a')
})

test('loadProfiles: self first, labels from config, dir-name fallback, no email', async () => {
  const self: Self = { home: HOME, profileDir: 'Claude-Work', profilePath: `${AS}/Claude-Work`, desktopPid: 1 }
  const profiles = await loadProfiles(fixture(), self, 1000, iso => iso)
  assert.deepEqual(profiles.map(p => [p.dir, p.label, p.email, p.isSelf]), [
    ['Claude-Work', 'Claude Work', null, true],
    ['Claude', 'Personal', 'me@example.com', false],
  ])
})

test('loadProfiles with a single profile returns only self', async () => {
  const fs = memFs({ [`${AS}/Claude/claude-code-sessions/a/o/x.txt`]: '' })
  const self: Self = { home: HOME, profileDir: 'Claude', profilePath: `${AS}/Claude`, desktopPid: 1 }
  const profiles = await loadProfiles(fs, self, 0, iso => iso)
  assert.equal(profiles.length, 1)
  assert.equal(profiles[0]!.sessions.length, 0)
})
