import assert from 'node:assert/strict'
import { test } from 'node:test'
import { forkTranscript } from '../../lib/fork.ts'

const OLD = '11111111-1111-4111-8111-111111111111'
const NEW = '22222222-2222-4222-8222-222222222222'

const lines = [
  `{"type":"user","sessionId":"${OLD}","message":{"role":"user","content":"hello"}}`,
  `{"type":"bridge-session","sessionId":"${OLD}","bridgeSessionId":"session_01abc"}`,
  `{"type":"assistant","sessionId":"${OLD}","message":{"content":[{"type":"text","text":"your id is \\"sessionId\\":\\"${OLD}\\""}]}}`,
  `{"type":"custom-title","customTitle":"Fix login","sessionId":"${OLD}"}`,
  '',
]

test('rewrites every sessionId key and drops bridge-session lines', () => {
  const out = forkTranscript(lines.join('\n'), OLD, NEW).split('\n')
  assert.equal(out.length, 4)
  assert.ok(out.every(l => !l.includes(`"sessionId":"${OLD}"`)))
  assert.ok(!out.some(l => l.includes('bridge-session')))
  assert.equal(out[0], lines[0]!.replace(OLD, NEW))
})

test('leaves the old id inside message text untouched', () => {
  const out = forkTranscript(lines.join('\n'), OLD, NEW).split('\n')
  assert.ok(out[1]!.includes(`\\"sessionId\\":\\"${OLD}\\"`))
  assert.ok(out[1]!.startsWith(`{"type":"assistant","sessionId":"${NEW}"`))
})

test('keeps the trailing newline and unrelated lines byte for byte', () => {
  const text = `{"type":"mode","mode":"auto"}\n`
  assert.equal(forkTranscript(text, OLD, NEW), text)
})

test('forkArgv streams the same rewrite with sed', async () => {
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { forkArgv } = await import('../../lib/fork.ts')
  const dir = mkdtempSync(`${tmpdir()}/baton-fork-`)
  const text = lines.join('\n')
  writeFileSync(`${dir}/src.jsonl`, text)
  const [cmd, ...args] = forkArgv(`${dir}/src.jsonl`, `${dir}/out.jsonl`, OLD, NEW)
  execFileSync(cmd!, args)
  assert.equal(readFileSync(`${dir}/out.jsonl`, 'utf8'), forkTranscript(text, OLD, NEW))
})
