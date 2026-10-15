export type FsEntry = { name: string; kind: 'file' | 'dir' | 'other' }

export type Fs = {
  list: (path: string) => Promise<readonly FsEntry[]>
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  size: (path: string) => Promise<number>
  write: (path: string, text: string) => Promise<void>
}

export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type Run = (argv: readonly string[]) => Promise<RunResult>

export type Session = {
  cliSessionId: string
  title: string
  folder: string
  branch: string
  lastActivityAt: number
  limitedAt: number | null
  resetText: string | null
  pr: string | null
  model: string
  tokensApprox: number
  transcriptPath: string
  state: 'blocked' | 'completed' | null
  repo: string
  customGroup: string | null
  fromProject: boolean
  createdAt: number
}

export type Usage = {
  percent: number
  resetLabel: string | null
  asOf: number
  source: 'baton' | 'desktop' | 'limit-error'
}

export type Profile = {
  dir: string
  path: string
  label: string
  email: string | null
  isSelf: boolean
  usage: Usage | null
  sessions: Session[]
  customGroups: string[]
}

export type Self = { home: string; profileDir: string; profilePath: string; desktopPid: number }

export type Config = { profiles?: Record<string, { label?: string; email?: string }> }

export type RowStatus = 'idle' | 'queued' | 'opening' | 'opened' | 'failed'
export type RowState = { status: RowStatus; forkId: string | null; reason: string | null }

export type AboutState = { status: 'loading' | 'done' | 'failed'; text: string; open: boolean; at: number }

export type BatonState = {
  self: Self | null
  profiles: Profile[]
  selected: string
  filter: string
  rows: Record<string, RowState>
  about: Record<string, AboutState>
}

declare module 'claude-code' {
  interface PluginState {
    baton: { state: BatonState }
  }
}
