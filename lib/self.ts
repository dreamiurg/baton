import type { Run, Self } from './types.ts'

export type Proc = { pid: number; ppid: number; command: string }

const PROFILE = /\/Library\/Application Support\/([^/]+)\/claude-code\//
const DESKTOP = /\/Contents\/MacOS\/Claude(?:\s|$)/

export function parsePs(line: string): Proc | null {
  const m = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)
  return m ? { pid: Number(m[1]), ppid: Number(m[2]), command: m[3]! } : null
}

export function findSelf(chain: readonly Proc[], home: string): Self | null {
  const profileDir = chain.map(p => PROFILE.exec(p.command)?.[1]).find(Boolean)
  const desktop = chain.find(p => DESKTOP.test(p.command))
  if (!profileDir || !desktop) return null
  return { home, profileDir, profilePath: `${home}/Library/Application Support/${profileDir}`, desktopPid: desktop.pid }
}

export async function readSelf(run: Run): Promise<Self | null> {
  const start = await run(['/bin/sh', '-c', 'echo "$PPID"; echo "$HOME"'])
  const [pidText = '', home = ''] = start.stdout.trim().split('\n')
  const chain: Proc[] = []
  let pid = Number(pidText)
  for (let i = 0; i < 8 && pid > 1; i++) {
    const out = await run(['/bin/ps', '-o', 'pid=,ppid=,command=', '-p', String(pid)])
    const proc = out.exitCode === 0 ? parsePs(out.stdout.trim()) : null
    if (!proc) break
    chain.push(proc)
    pid = proc.ppid
  }
  return findSelf(chain, home)
}

// The window a session runs in never changes, so resolve it once (null included: a terminal session stays one).
export function selfCache(): (run: Run) => Promise<Self | null> {
  let cached: Promise<Self | null> | undefined
  return run => (cached ??= readSelf(run))
}
