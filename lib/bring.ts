import { forkTranscript } from './fork.ts'
import type { Fs, Run, RunResult, Self, Session } from './types.ts'
import { serializeReading } from './usage.ts'

export type BringDeps = { fs: Fs; run: Run; sleep: (ms: number) => Promise<void> }
export type BringResult = { ok: true; forkId: string } | { ok: false; forkId: string | null; reason: string }

// Sends a GURL (open URL) Apple Event to one process id, so the link reaches this window even when several Desktop windows run.
export const GURL_SCRIPT = [
  "ObjC.import('Foundation');",
  'function run(argv) {',
  '  var target = $.NSAppleEventDescriptor.descriptorWithProcessIdentifier(parseInt(argv[0]));',
  '  var ev = $.NSAppleEventDescriptor.appleEventWithEventClassEventIDTargetDescriptorReturnIDTransactionID(0x4755524c, 0x4755524c, target, -1, 0);',
  '  ev.setParamDescriptorForKeyword($.NSAppleEventDescriptor.descriptorWithString(argv[1]), 0x2d2d2d2d);',
  '  var err = Ref();',
  '  var res = ev.sendEventWithOptionsTimeoutError(0x1, 10, err);',
  "  return (res && !res.isNil()) ? 'sent' : 'error';",
  '}',
].join('\n')

async function must(p: Promise<RunResult>): Promise<RunResult> {
  const r = await p
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `exit ${r.exitCode}`)
  return r
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function bringSession(s: Session, self: Self, deps: BringDeps, forkId: string | null = null): Promise<BringResult> {
  const dir = s.transcriptPath.slice(0, s.transcriptPath.lastIndexOf('/'))
  const id = forkId ?? (await deps.run(['/usr/bin/uuidgen'])).stdout.trim().toLowerCase()
  if (!id) return { ok: false, forkId: null, reason: "Couldn't create a session id (uuidgen failed)." }
  try {
    const target = `${dir}/${id}.jsonl`
    if (!(await deps.fs.exists(target))) {
      const text = await deps.fs.read(s.transcriptPath)
      await deps.fs.write(`${target}.tmp`, forkTranscript(text, s.cliSessionId, id))
      await must(deps.run(['/bin/mv', `${target}.tmp`, target]))
      const sidecar = `${dir}/${s.cliSessionId}`
      if (await deps.fs.exists(sidecar)) await must(deps.run(['/bin/cp', '-R', sidecar, `${dir}/${id}`]))
    }
  } catch (err) {
    await deps.run(['/bin/rm', '-f', `${dir}/${id}.jsonl.tmp`])
    return { ok: false, forkId: null, reason: `Couldn't copy the transcript: ${message(err)}` }
  }

  const sent = await deps.run(['/usr/bin/osascript', '-l', 'JavaScript', '-e', GURL_SCRIPT, String(self.desktopPid), `claude://resume?session=${id}`])
  if (sent.exitCode !== 0 || !sent.stdout.includes('sent')) {
    return { ok: false, forkId: id, reason: "Couldn't reach this window's Claude app. Retry, or restart the window." }
  }

  const sessionsDir = `${self.profilePath}/claude-code-sessions`
  for (let i = 0; i < 20; i++) {
    const found = await deps.run(['/bin/sh', '-c', 'ls "$1"/*/*/local_"$2".json', 'sh', sessionsDir, id])
    if (found.exitCode === 0) return { ok: true, forkId: id }
    await deps.sleep(500)
  }
  return { ok: false, forkId: id, reason: "Desktop didn't open it. Retry sends the link again." }
}

export async function writeUsage(deps: BringDeps, self: Self, rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[], now: number): Promise<void> {
  const text = serializeReading(rateLimits, now)
  if (text === null) return
  const dir = `${self.home}/.local/state/baton/usage`
  await deps.run(['/bin/mkdir', '-p', dir])
  await deps.fs.write(`${dir}/${self.profileDir}.json`, text)
}
