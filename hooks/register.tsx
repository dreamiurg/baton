import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'bring', description: 'Bring a session from another account into this window' })
    return next(e)
  })

  on('command.run', { command: 'bring' }, async () => ({ text: 'baton is installed.' }))
}
