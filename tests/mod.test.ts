import { expect, test } from 'claude-code/testing'

const bringInput = (args = '') =>
  ({ command: 'bring', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

test('/bring is registered and answers without a model turn', async $ => {
  const answer = await $.command.run(bringInput())
  expect(JSON.stringify(answer)).toContain('baton')
})
