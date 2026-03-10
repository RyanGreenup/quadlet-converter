const UNITS: Record<string, number> = {
  b: 1,
  k: 1024,
  m: 1024 ** 2,
  g: 1024 ** 3,
}

const UNIT_ORDER: [string, number][] = [
  ['g', 1024 ** 3],
  ['m', 1024 ** 2],
  ['k', 1024],
]

export function parseBytes(value: string | number): number {
  if (typeof value === 'number') return value
  const match = value.match(/^(\d+(?:\.\d+)?)\s*([bkmg])?$/i)
  if (!match) throw new Error(`Invalid byte value: ${value}`)
  const num = parseFloat(match[1])
  const unit = (match[2] ?? 'b').toLowerCase()
  return Math.round(num * UNITS[unit])
}

export function formatBytes(bytes: number): string {
  for (const [suffix, size] of UNIT_ORDER) {
    if (bytes >= size && bytes % size === 0) {
      return `${bytes / size}${suffix}`
    }
  }
  return String(bytes)
}
