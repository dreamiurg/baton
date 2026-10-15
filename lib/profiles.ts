import type { Config, Fs, Profile, Self, Session } from './types.ts'
import { pickUsage } from './usage.ts'

export type Rec = {
  cliSessionId?: string
  title?: string
  cwd?: string
  originCwd?: string
  branch?: string
  sourceBranch?: string
  lastActivityAt?: number
  isArchived?: boolean
  error?: string
  errorAt?: number
  model?: string
  prs?: { prNumber?: number; state?: string }[]
  prNumber?: number
  prState?: string
}

const LIMIT = /hit your .*limit/i
const RESETS = /resets\s+(.+)$/i

export const projectDirName = (cwd: string): string => cwd.replace(/[^a-zA-Z0-9]/g, '-')

export function modelLabel(id: string | undefined): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id ?? '')
  if (!m) return id ?? ''
  const [, family = '', major = '', minor] = m
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}${minor ? '.' + minor : ''}`
}

export function prLabel(rec: Rec): string | null {
  const last = rec.prs && rec.prs.length ? rec.prs[rec.prs.length - 1] : undefined
  const n = last?.prNumber ?? rec.prNumber
  const state = (last?.state ?? rec.prState ?? '').toLowerCase()
  return n ? `#${n}${state ? ' ' + state : ''}` : null
}

async function listDirs(fs: Fs, path: string): Promise<string[]> {
  try {
    return (await fs.list(path)).filter(e => e.kind === 'dir').map(e => e.name)
  } catch {
    return []
  }
}

async function findTranscript(fs: Fs, home: string, rec: Rec, id: string): Promise<string | null> {
  for (const cwd of [rec.originCwd, rec.cwd]) {
    if (!cwd) continue
    const path = `${home}/.claude/projects/${projectDirName(cwd)}/${id}.jsonl`
    if (await fs.exists(path)) return path
  }
  return null
}

export async function readSessions(fs: Fs, home: string, profilePath: string): Promise<{ sessions: Session[]; orgId: string | null }> {
  const root = `${profilePath}/claude-code-sessions`
  const sessions: Session[] = []
  let orgId: string | null = null
  let newest = -1
  for (const acct of await listDirs(fs, root)) {
    for (const org of await listDirs(fs, `${root}/${acct}`)) {
      const dir = `${root}/${acct}/${org}`
      for (const f of await fs.list(dir).catch(() => [])) {
        if (f.kind !== 'file' || !f.name.startsWith('local_') || !f.name.endsWith('.json')) continue
        let rec: Rec
        try {
          rec = JSON.parse(await fs.read(`${dir}/${f.name}`)) as Rec
        } catch {
          continue // Desktop may be mid-write; skip this record only
        }
        const id = rec.cliSessionId
        if (!id || rec.isArchived) continue
        const transcriptPath = await findTranscript(fs, home, rec, id)
        if (!transcriptPath) continue
        const last = rec.lastActivityAt ?? 0
        if (last > newest) {
          newest = last
          orgId = org
        }
        const limited = rec.error && LIMIT.test(rec.error) ? rec.errorAt ?? last : null
        sessions.push({
          cliSessionId: id,
          title: rec.title ?? 'Untitled session',
          folder: (rec.originCwd ?? rec.cwd ?? '').split('/').filter(Boolean).pop() ?? '',
          branch: rec.branch ?? rec.sourceBranch ?? '',
          lastActivityAt: last,
          limitedAt: limited,
          resetText: limited !== null ? RESETS.exec(rec.error ?? '')?.[1] ?? null : null,
          pr: prLabel(rec),
          model: modelLabel(rec.model),
          tokensApprox: Math.round((await fs.size(transcriptPath)) / 4),
          transcriptPath,
        })
      }
    }
  }
  sessions.sort((a, b) =>
    a.limitedAt !== null && b.limitedAt !== null ? b.limitedAt - a.limitedAt
    : a.limitedAt !== null ? -1
    : b.limitedAt !== null ? 1
    : b.lastActivityAt - a.lastActivityAt)
  return { sessions, orgId }
}

async function readText(fs: Fs, path: string): Promise<string | null> {
  try {
    return await fs.read(path)
  } catch {
    return null
  }
}

export async function loadProfiles(fs: Fs, self: Self, now: number, formatReset: (iso: string) => string): Promise<Profile[]> {
  const support = `${self.home}/Library/Application Support`
  let config: Config = {}
  try {
    config = JSON.parse((await readText(fs, `${self.home}/.config/baton/config.json`)) ?? '{}') as Config
  } catch {
    config = {}
  }
  const profiles: Profile[] = []
  for (const dir of await listDirs(fs, support)) {
    if (!dir.startsWith('Claude')) continue
    const path = `${support}/${dir}`
    if (!(await fs.exists(`${path}/claude-code-sessions`))) continue
    const { sessions, orgId } = await readSessions(fs, self.home, path)
    // A limit error only describes the account now if nothing in this profile ran after it.
    const latestLimited = sessions.find(s => s.limitedAt !== null)
    const latestActivity = Math.max(0, ...sessions.map(s => s.lastActivityAt))
    const newestLimit = latestLimited && latestActivity <= latestLimited.limitedAt! + 5 * 60_000 ? latestLimited.resetText ?? '' : null
    const usage = pickUsage({
      baton: await readText(fs, `${self.home}/.local/state/baton/usage/${dir}.json`),
      planHistory: await readText(fs, `${path}/plan-usage-history.json`),
      orgId,
      limitReset: newestLimit,
      now,
      formatReset,
    })
    const entry = config.profiles?.[dir]
    profiles.push({
      dir,
      path,
      label: entry?.label ?? dir.replace(/-/g, ' '),
      email: entry?.email ?? null,
      isSelf: dir === self.profileDir,
      usage,
      sessions,
    })
  }
  profiles.sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.label.localeCompare(b.label)))
  return profiles
}
