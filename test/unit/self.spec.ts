import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findSelf, parsePs, readSelf } from '../../lib/self.ts'
import type { Run } from '../../lib/types.ts'

const HOME = '/Users/u'
const CLI = `${HOME}/Library/Application Support/Claude-Work/claude-code/2.1.295/abc/claude.app/Contents/MacOS/claude --output-format stream-json`
const PS: Record<string, string> = {
  '700': `  700   600 ${CLI}`,
  '600': `  600   500 /Applications/Claude.app/Contents/Helpers/disclaimer --pgroup -- ${CLI}`,
  '500': '  500     1 /Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/x',
}

test('parsePs reads pid, ppid and the full command', () => {
  assert.deepEqual(parsePs(PS['500']!), { pid: 500, ppid: 1, command: '/Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/x' })
  assert.equal(parsePs('garbage'), null)
})

test('findSelf takes the profile from the CLI path and the PID from the Desktop ancestor', () => {
  const chain = ['700', '600', '500'].map(p => parsePs(PS[p]!)!)
  assert.deepEqual(findSelf(chain, HOME), {
    home: HOME,
    profileDir: 'Claude-Work',
    profilePath: `${HOME}/Library/Application Support/Claude-Work`,
    desktopPid: 500,
  })
})

test('a terminal session has no Desktop ancestor', () => {
  assert.equal(findSelf([{ pid: 9, ppid: 1, command: '/opt/homebrew/bin/claude' }], HOME), null)
})

test('readSelf walks the chain with ps', async () => {
  const run: Run = async argv => {
    if (argv[0] === '/bin/sh') return { exitCode: 0, stdout: `700\n${HOME}\n`, stderr: '' }
    const line = PS[argv[argv.length - 1]!]
    return line ? { exitCode: 0, stdout: line + '\n', stderr: '' } : { exitCode: 1, stdout: '', stderr: '' }
  }
  assert.equal((await readSelf(run))!.desktopPid, 500)
})
