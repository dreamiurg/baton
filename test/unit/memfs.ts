import type { Fs, FsEntry } from '../../lib/types.ts'

export function memFs(files: Record<string, string>): Fs & { files: Record<string, string> } {
  const dirs = new Set<string>()
  for (const p of Object.keys(files)) {
    const parts = p.split('/')
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  return {
    files,
    list: async path => {
      const seen = new Map<string, FsEntry>()
      for (const p of [...Object.keys(files), ...dirs]) {
        if (!p.startsWith(path + '/')) continue
        const name = p.slice(path.length + 1).split('/')[0]!
        const full = `${path}/${name}`
        seen.set(name, { name, kind: dirs.has(full) ? 'dir' : 'file' })
      }
      if (!seen.size && !dirs.has(path)) throw new Error(`ENOENT ${path}`)
      return [...seen.values()]
    },
    read: async path => {
      const t = files[path]
      if (t === undefined) throw new Error(`ENOENT ${path}`)
      return t
    },
    exists: async path => path in files || dirs.has(path),
    size: async path => (files[path] ?? '').length,
    write: async (path, text) => {
      files[path] = text
    },
  }
}
