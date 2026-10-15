// Rewrites only the top-level "sessionId":"<old>" keys; message text that quotes the id is escaped JSON and never matches.
export function forkTranscript(text: string, oldId: string, newId: string): string {
  const needle = `"sessionId":"${oldId}"`
  const replacement = `"sessionId":"${newId}"`
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (line.includes('"type":"bridge-session"') && isBridgeSession(line)) continue
    out.push(line.includes(needle) ? line.split(needle).join(replacement) : line)
  }
  return out.join('\n')
}

function isBridgeSession(line: string): boolean {
  try {
    return (JSON.parse(line) as { type?: unknown }).type === 'bridge-session'
  } catch {
    return false
  }
}
