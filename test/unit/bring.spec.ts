import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bringSession } from '../../lib/bring.ts'
import type { Run, Self, Session } from '../../lib/types.ts'
import { memFs } from './memfs.ts'

const DIR = '/Users/u/.claude/projects/-r-app'
const OLD = 'aaaaaaaa-0000-4000-8000-000000000000'
const NEW = 'bbbbbbbb-0000-4000-8000-000000000000'
const self: Self = { home: '/Users/u', profileDir: 'Claude', profilePath: '/Users/u/Library/Application Support/Claude', desktopPid: 500 }
const session: Session = { cliSessionId: OLD, title: 'T', folder: 'app', branch: 'main', lastActivityAt: 1, limitedAt: null, resetText: null, pr: null, model: '', tokensApprox: 1, transcriptPath: `${DIR}/${OLD}.jsonl` }

function harness(opts: { imports?: boolean; sendOk?: boolean } = {}) {
  const fs = memFs({ [`${DIR}/${OLD}.jsonl`]: `{"type":"user","sessionId":"${OLD}"}\n` })
  const calls: string[][] = []
  const run: Run = async argv => {
    calls.push([...argv])
    if (argv[0] === '/usr/bin/uuidgen') return { exitCode: 0, stdout: NEW.toUpperCase() + '\n', stderr: '' }
    if (argv[0] === '/bin/mv') {
      fs.files[argv[2]!] = fs.files[argv[1]!]!
      delete fs.files[argv[1]!]
      return { exitCode: 0, stdout: '', stderr: '' }
    }
    if (argv[0] === '/usr/bin/osascript') return { exitCode: 0, stdout: opts.sendOk === false ? 'error\n' : 'sent\n', stderr: '' }
    if (argv[0] === '/bin/sh') return { exitCode: opts.imports === false ? 1 : 0, stdout: '', stderr: '' }
    return { exitCode: 0, stdout: '', stderr: '' }
  }
  return { fs, run, calls, deps: { fs, run, sleep: async () => {} } }
}

test('forks, sends the link to the own Desktop PID, and waits for the record', async () => {
  const h = harness()
  assert.deepEqual(await bringSession(session, self, h.deps), { ok: true, forkId: NEW })
  assert.equal(h.fs.files[`${DIR}/${NEW}.jsonl`], `{"type":"user","sessionId":"${NEW}"}\n`)
  assert.equal(h.fs.files[`${DIR}/${OLD}.jsonl`], `{"type":"user","sessionId":"${OLD}"}\n`)
  const send = h.calls.find(c => c[0] === '/usr/bin/osascript')!
  assert.deepEqual(send.slice(-2), ['500', `claude://resume?session=${NEW}`])
})

test('a failed send keeps the fork for Retry', async () => {
  const h = harness({ sendOk: false })
  const r = await bringSession(session, self, h.deps)
  assert.equal(r.ok, false)
  assert.equal(r.forkId, NEW)
  assert.match((r as { reason: string }).reason, /Couldn't reach this window's Claude app/)
})

test('Retry reuses the fork and does not copy again', async () => {
  const h = harness()
  h.fs.files[`${DIR}/${NEW}.jsonl`] = 'already forked'
  await bringSession(session, self, h.deps, NEW)
  assert.equal(h.fs.files[`${DIR}/${NEW}.jsonl`], 'already forked')
  assert.ok(!h.calls.some(c => c[0] === '/usr/bin/uuidgen'))
})

test('Desktop never creating the record is a failure with a reason', async () => {
  const h = harness({ imports: false })
  const r = await bringSession(session, self, h.deps)
  assert.deepEqual(r, { ok: false, forkId: NEW, reason: "Desktop didn't open it. Retry sends the link again." })
})
