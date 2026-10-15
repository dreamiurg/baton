import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { bringSession, writeUsage } from '../lib/bring.ts'
import type { BringDeps } from '../lib/bring.ts'
import { loadProfiles } from '../lib/profiles.ts'
import { selfCache } from '../lib/self.ts'
import type { BatonState, Profile, RowState, Session } from '../lib/types.ts'

const PANE = 'baton-bring'
const EMPTY: BatonState = { self: null, profiles: [], selected: '', filter: '', rows: {} }
const state = atom({ plugin: 'baton', key: 'state' } as const, EMPTY)
const IDLE: RowState = { status: 'idle', forkId: null, reason: null }

type Io = {
  fs: {
    list: (p: string) => Promise<readonly { name: string; kind: 'file' | 'dir' | 'other' }[]>
    read: (p: string) => Promise<string>
    exists: (p: string) => Promise<boolean>
    stat: (p: string) => Promise<{ size: number }>
    write: (p: string, t: string) => Promise<void>
  }
  process: { run: (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }> }
  clock: { sleep: (ms: number) => Promise<void> }
}

const depsOf = ($: Io): BringDeps => ({
  fs: {
    list: p => $.fs.list(p),
    read: p => $.fs.read(p),
    exists: p => $.fs.exists(p),
    size: async p => (await $.fs.stat(p)).size,
    write: (p, t) => $.fs.write(p, t),
  },
  run: argv => $.process.run(argv),
  sleep: ms => $.clock.sleep(ms),
})

const formatReset = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })

const ago = (now: number, at: number) => {
  const m = Math.max(0, Math.round((now - at) / 60000))
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}

const stalledOf = (p: Profile) => p.sessions.filter(s => s.limitedAt !== null)

export const register: Register = on => {
  const selfOf = selfCache()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'bring', description: 'Bring a session from another account into this window' })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const self = await selfOf(depsOf($).run)
    if (self) await writeUsage(depsOf($), self, e.rateLimits, await $.clock.now())
    return next(e)
  })

  on('command.run', { command: 'bring' }, async ($, e) => {
    const deps = depsOf($)
    const self = await selfOf(deps.run)
    if (!self) return { text: 'Run /bring in a Claude Desktop Code session.' }
    const profiles = await loadProfiles(deps.fs, self, await $.clock.now(), formatReset)
    const others = profiles.filter(p => !p.isSelf)
    if (others.length === 0) return { text: 'No other Claude profiles found. See the baton README to add one.' }
    const want = e.args.trim().toLowerCase()
    const pick = others.find(p => want !== '' && p.label.toLowerCase() === want) ?? others.find(p => stalledOf(p).length > 0) ?? others[0]!
    await update($, state, () => ({ self, profiles, selected: pick.dir, filter: '', rows: {} }))
    const opened = await $.ui.open({ id: PANE, title: 'Bring a session here' })
    const n = stalledOf(pick).length
    const line = `${profiles.length} accounts, ${n} stalled session${n === 1 ? '' : 's'} in ${pick.label}`
    return { text: opened.isPlaced ? line : `${line}. Widen the window to see the Bring page.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : null
    const s = await read($, state)
    const now = await $.clock.now()
    const self = s.profiles.find(p => p.isSelf)
    const others = s.profiles.filter(p => !p.isSelf)
    const from = others.find(p => p.dir === s.selected) ?? others[0]
    if (!self || !from || !s.self) return <Text dimColor>Run /bring to load your accounts.</Text>

    const rowOf = (id: string) => s.rows[id] ?? IDLE
    const setRow = (id: string, row: RowState) =>
      update($, state, st => ({ ...st, rows: { ...st.rows, [id]: row } }))

    const bring = async (session: Session) => {
      const prior = rowOf(session.cliSessionId)
      await setRow(session.cliSessionId, { status: 'opening', forkId: prior.forkId, reason: null })
      const r = await bringSession(session, s.self!, depsOf($), prior.forkId)
      await setRow(session.cliSessionId, r.ok
        ? { status: 'opened', forkId: r.forkId, reason: null }
        : { status: 'failed', forkId: r.forkId, reason: r.reason })
    }

    const match = (x: Session) => {
      const q = s.filter.trim().toLowerCase()
      return q === '' || `${x.title} ${x.folder} ${x.branch}`.toLowerCase().includes(q)
    }
    const stalled = stalledOf(from).filter(match)
    const recent = from.sessions.filter(x => x.limitedAt === null).filter(match)
    const pending = stalled.filter(x => rowOf(x.cliSessionId).status === 'idle')
    const running = stalled.filter(x => ['queued', 'opening'].includes(rowOf(x.cliSessionId).status))
    const done = stalled.filter(x => rowOf(x.cliSessionId).status === 'opened').length

    const bringAll = async () => {
      for (const x of pending) await setRow(x.cliSessionId, { ...rowOf(x.cliSessionId), status: 'queued' })
      for (const x of pending) await bring(x)
    }

    // Layout units are cells on every surface, so the meter is one line of text, not a sized box.
    const BAR = 12
    const bar = (p: Profile) => {
      const pct = Math.min(100, Math.round(p.usage?.percent ?? 0))
      const full = pct >= 100
      const filled = Math.round((pct / 100) * BAR)
      const text = !p.usage ? 'no usage reading yet'
        : full ? `Limit${p.usage.resetLabel ? ' · resets ' + p.usage.resetLabel : ''}`
        : `${pct}% of weekly used${p.usage.resetLabel ? ' · resets ' + p.usage.resetLabel : ''}`
      const stale = p.usage && now - p.usage.asOf > 6 * 3600_000 ? ` · as of ${ago(now, p.usage.asOf)} ago` : ''
      return (
        <Text wrap="truncate-end">
          {p.usage && <Text color={full ? '#C2410C' : '#2F6FDB'}>{'━'.repeat(filled)}</Text>}
          {p.usage && <Text color="#D9D5CC">{'━'.repeat(BAR - filled)}</Text>}
          {p.usage ? ' ' : ''}<Text dimColor>{text}{stale}</Text>
        </Text>
      )
    }

    const card = (p: Profile, selectable: boolean) => {
      const n = stalledOf(p).length
      const name = <Text bold>{p.label} <Text dimColor>{p.email ?? ''}</Text></Text>
      return (
        <Box key={`card:${p.dir}`} flexDirection="column" gap={0} paddingX={1} borderStyle="round"
          borderColor={p.dir === from.dir && selectable ? '#9DB8EE' : '#E5E2DA'}>
          <Box flexDirection="row" justifyContent="space-between" gap={1}>
            {selectable ? (
              <Button key={`account:${p.dir}`} plain onPress={() => update($, state, st => ({ ...st, selected: p.dir }))}>
                {p.label} <Text dimColor>{p.email ?? ''}</Text>
              </Button>
            ) : name}
            {selectable && (
              <Text color={n ? '#8A4B08' : undefined} dimColor={!n}>
                {n ? `${n} stalled` : 'None stalled'} · {p.sessions.length} live
              </Text>
            )}
          </Box>
          {bar(p)}
        </Box>
      )
    }

    const action = (x: Session) => {
      const row = rowOf(x.cliSessionId)
      if (row.status === 'idle') return <Button key={`bring:${x.cliSessionId}`} label="Bring" onPress={() => bring(x)} />
      if (row.status === 'failed') return <Button key={`bring:${x.cliSessionId}`} label="Retry" onPress={() => bring(x)} />
      if (row.status === 'opened') return <Text color="#1D6B3A">Opened</Text>
      return <Text dimColor>{row.status === 'queued' ? 'Queued' : 'Opening…'}</Text>
    }

    const row = (x: Session, detailed: boolean) => {
      const r = rowOf(x.cliSessionId)
      return (
        <Box key={`row:${x.cliSessionId}`} flexDirection="row" gap={2} paddingY={1} alignItems="center">
          <Box flexDirection="column" flexGrow={1} minWidth={0}>
            <Box flexDirection="row" justifyContent="space-between" gap={1}>
              <Text bold={detailed} wrap="truncate-end">{x.title}</Text>
              <Text dimColor>{ago(now, x.lastActivityAt)}</Text>
            </Box>
            <Text dimColor wrap="truncate-end">{x.folder}{x.branch ? ` · ${x.branch}` : ''}{x.pr ? `  ${x.pr}` : ''}</Text>
            {detailed && (
              <Text dimColor>
                <Text color="#8A4B08">Limit {ago(now, x.limitedAt ?? now)} ago</Text>
                {x.model ? ` · ${x.model}` : ''} · ≈ {Math.round(x.tokensApprox / 1000)}k tokens to resume
              </Text>
            )}
            {r.status === 'failed' && <Text color="#A1281F">{r.reason}</Text>}
          </Box>
          {action(x)}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Text dimColor>Into this window</Text>
        {card(self, false)}
        <Text dimColor>From account</Text>
        {others.map(p => card(p, true))}
        {Input && (
          <Input key="filter" label="Filter" placeholder="Title, folder or branch" value={s.filter}
            onInput={(value: string) => update($, state, st => ({ ...st, filter: value }))}
            onSubmit={(value: string) => update($, state, st => ({ ...st, filter: value }))} />
        )}
        {stalled.length > 0 && (
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Text bold color="#8A4B08">Hit weekly limit · {stalled.length}</Text>
            <Button key="bring-all" variant="primary"
              label={running.length ? `Bringing ${done} of ${stalled.length}…` : pending.length ? `Bring all ${pending.length}` : 'All brought'}
              onPress={() => (pending.length && !running.length ? bringAll() : undefined)} />
          </Box>
        )}
        {stalled.length === 0 && from.sessions.length > 0 && (
          <Text dimColor>No session in {from.label} has hit its limit. You can still bring any recent one.</Text>
        )}
        {stalled.map(x => row(x, true))}
        {recent.length > 0 && <Text bold dimColor>{stalled.length ? 'Other recent' : 'Recent'} · {recent.length}</Text>}
        {recent.map(x => row(x, false))}
        {from.sessions.length === 0 && <Text dimColor>No live sessions in {from.label}.</Text>}
        <Text dimColor>Bring makes a copy here. The original stays in {from.label}.</Text>
      </Box>
    )
  })
}
