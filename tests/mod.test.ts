import { expect, test } from 'claude-code/testing'

const bringInput = (args = '') =>
  ({ command: 'bring', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

const HOME = '/Users/u'
const AS = `${HOME}/Library/Application Support`
const CLI = `${AS}/Claude/claude-code/2.1.295/abc/claude.app/Contents/MacOS/claude`
const files: Record<string, string> = {
  [`${AS}/Claude/claude-code-sessions/a/o/scheduled-tasks.json`]: '{}',
  [`${AS}/Claude-Work/claude-code-sessions/a/o/local_1.json`]: JSON.stringify({ cliSessionId: 'aaa', title: 'Fix login', originCwd: '/r/app', lastActivityAt: 1, error: "You've hit your weekly limit · resets 1am", errorAt: 1 }),
  [`${HOME}/.claude/projects/-r-app/aaa.jsonl`]: '{"type":"user","sessionId":"aaa"}\n',
  [`${AS}/Claude-Work/claude-code-sessions/a/o/local_2.json`]: JSON.stringify({ cliSessionId: 'ccc', title: 'Statsig thread', originCwd: '/r/app', lastActivityAt: 2, error: "You've hit your weekly limit · resets 1am", errorAt: 2, remoteControlSpawn: { projectThreadChild: true } }),
  [`${HOME}/.claude/projects/-r-app/ccc.jsonl`]: '{"type":"user","sessionId":"ccc"}\n',
}
const dirsOf = (path: string) => [...new Set(Object.keys(files).filter(p => p.startsWith(path + '/')).map(p => p.slice(path.length + 1).split('/')[0]!))]
const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

test('in a terminal session /bring explains where to run it', async ($, on) => {
  on('process.run', async () => out('1\n/Users/u\n'))
  const answer = await $.command.run(bringInput())
  expect(JSON.stringify(answer)).toContain('Run /bring in a Claude Desktop Code session.')
})

test('/bring lists the stalled session from the other profile', async ($, on) => {
  on('process.run', async (_$, e) => {
    const argv = e.argv
    if (argv[0] === '/bin/sh') return out(`700\n${HOME}\n`)
    if (argv.at(-1) === '700') return out(`700 500 ${CLI}\n`)
    if (argv.at(-1) === '500') return out('500 1 /Applications/Claude.app/Contents/MacOS/Claude\n')
    if (argv[0] === '/usr/bin/head' || argv[0] === '/usr/bin/tail') return out(`\n{"type":"user","message":{"content":"Fix the login flow"}}\n`)
    return out('', 1)
  })
  on('fs.list', async (_$, e) => ({ value: dirsOf(e.path).map(name => ({ name, kind: `${e.path}/${name}` in files ? ('file' as const) : ('dir' as const), size: 1, mtimeMs: 0, isLink: false })) }))
  on('fs.read', async (_$, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.exists', async (_$, e) => ({ value: e.path in files || Object.keys(files).some(p => p.startsWith(e.path + '/')) }))
  on('clock.now', async () => ({ value: 3_600_000 }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  const store = new Map<string, unknown>()
  on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', async (_$, e) => (store.set(e.key, e.value), { value: undefined }))
  on('fs.stat', async () => ({ value: { kind: 'file' as const, size: 400, mtimeMs: 0, isLink: false } }))

  let prompt = ''
  on('model.complete', async (_$, e) => {
    prompt = String(e.prompt)
    return { value: { isAnswered: true as const, text: 'Fixes the login flow; waiting on review.', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  })
  const answer = await $.command.run(bringInput())
  expect(JSON.stringify(answer)).toContain('2 accounts, 1 stalled session in Claude Work')
  const about = await $.ui.mount({ plugin: 'baton', surface: 'desktop', component: 'Pane', requestId: 'baton-bring', props: { title: 'Bring a session here', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } })
  await about.press({ key: 'about:aaa' })
  expect(prompt).toContain('<transcript>')
  expect(await about.find({ type: 'Text', text: /Fixes the login flow; waiting on review\./ })).toBeDefined()
  expect(await about.find({ key: 'group-by' })).toBeDefined()
  expect(await about.find({ type: 'Text', text: /Statsig thread/ })).toBeUndefined()
  await about.press({ key: 'threads' })
  expect(await about.find({ type: 'Text', text: /Statsig thread/ })).toBeDefined()
  await about.select({ key: 'group-by', value: 'project' })
  expect(await about.find({ key: 'group:app' })).toBeDefined()
  await about.unmount()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'baton', surface, component: 'Pane', requestId: 'baton-bring', props: { title: 'Bring a session here', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } })
    expect(await ui.find({ type: 'Text', text: /Fix login/ })).toBeDefined()
    expect(await ui.find({ key: 'bring:aaa' })).toBeDefined()
    await ui.unmount()
  }
})
