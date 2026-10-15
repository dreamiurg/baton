import type { Session } from './types.ts'

export type GroupBy = 'state' | 'date' | 'project' | 'custom' | 'none'
export type SortBy = 'recent' | 'name' | 'created'
export type Group = { name: string; tone: 'limit' | 'thread' | 'plain'; sessions: Session[] }

export const GROUP_BY_LABELS: Record<GroupBy, string> = { state: 'State', date: 'Date', project: 'Project', custom: 'Custom groups', none: 'None' }
export const SORT_LABELS: Record<SortBy, string> = { recent: 'Recent', name: 'Name', created: 'Created' }
export const THREADS_GROUP = 'From claude.ai Projects'

// Sessions a claude.ai Project thread spawned are steered from claude.ai, so they never count as stalled here.
export const stalledOf = (sessions: readonly Session[]) => sessions.filter(s => s.limitedAt !== null && !s.fromProject)

const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0)

function dateBucket(t: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'This week' : 'Older'
}

const SORTERS: Record<SortBy, (a: Session, b: Session) => number> = {
  recent: (a, b) => b.lastActivityAt - a.lastActivityAt,
  name: (a, b) => a.title.localeCompare(b.title),
  created: (a, b) => b.createdAt - a.createdAt,
}

export function groupSessions(
  sessions: readonly Session[],
  o: { by: GroupBy; sort: SortBy; showThreads: boolean; customGroups: readonly string[]; now: number },
): Group[] {
  const keyOf: Record<GroupBy, (s: Session) => string> = {
    state: s => (s.limitedAt !== null ? 'Hit weekly limit' : s.state === 'blocked' ? 'Needs you' : s.state === 'completed' ? 'Done' : 'Other'),
    date: s => dateBucket(s.lastActivityAt, o.now),
    project: s => s.repo || 'No folder',
    custom: s => s.customGroup ?? 'Ungrouped',
    none: () => 'All sessions',
  }
  const fixedOrder: Partial<Record<GroupBy, readonly string[]>> = {
    state: ['Hit weekly limit', 'Needs you', 'Done', 'Other'],
    date: ['Today', 'Yesterday', 'This week', 'Older'],
    custom: [...o.customGroups, 'Ungrouped'],
  }
  const buckets = new Map<string, Session[]>()
  for (const s of [...sessions].filter(x => !x.fromProject).sort(SORTERS[o.sort])) {
    const k = keyOf[o.by](s)
    buckets.set(k, [...(buckets.get(k) ?? []), s])
  }
  const order = fixedOrder[o.by]
  const names = order
    ? order.filter(n => buckets.has(n))
    : [...buckets.keys()].sort((a, b) => buckets.get(b)!.length - buckets.get(a)!.length || a.localeCompare(b))
  const groups: Group[] = names.map(name => ({ name, tone: name === 'Hit weekly limit' ? 'limit' : 'plain', sessions: buckets.get(name)! }))
  const threads = sessions.filter(s => s.fromProject)
  if (o.showThreads && threads.length) groups.push({ name: THREADS_GROUP, tone: 'thread', sessions: [...threads].sort(SORTERS[o.sort]) })
  return groups
}
