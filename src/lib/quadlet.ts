export type QuadletData = Record<string, Record<string, string | string[]>>

export function parseQuadlet(text: string): QuadletData {
  const result: QuadletData = {}
  let currentSection: string | null = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue

    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      if (!result[currentSection]) result[currentSection] = {}
      continue
    }

    if (!currentSection) continue

    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue

    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    const section = result[currentSection]

    if (key in section) {
      const existing = section[key]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        section[key] = [existing, value]
      }
    } else {
      section[key] = value
    }
  }

  return result
}

export function serializeQuadlet(data: QuadletData): string {
  const sections = Object.entries(data)
  const parts: string[] = []

  for (const [sectionName, entries] of sections) {
    const lines: string[] = [`[${sectionName}]`]
    for (const [key, value] of Object.entries(entries)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          lines.push(`${key}=${v}`)
        }
      } else {
        lines.push(`${key}=${value}`)
      }
    }
    parts.push(lines.join('\n'))
  }

  return parts.join('\n\n') + '\n'
}
