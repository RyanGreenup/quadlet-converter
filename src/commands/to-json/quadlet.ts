import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'

function parseQuadlet(text: string): Record<string, Record<string, string | string[]>> {
  const result: Record<string, Record<string, string | string[]>> = {}
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

const quadletCommand = defineCommand({
  name: 'quadlet',
  description: 'Convert a Quadlet unit file to JSON',
  options: {
    pretty: option(
      z.boolean().default(true),
      {
        description: 'Pretty-print the JSON output',
        short: 'p'
      }
    )
  },
  handler: async ({ flags, positional }) => {
    const filePath = positional[0]
    if (!filePath) {
      console.error('Error: please provide a quadlet file path')
      process.exit(1)
    }

    const file = Bun.file(filePath)
    const text = await file.text()
    const parsed = parseQuadlet(text)
    const indent = flags.pretty ? 2 : undefined
    console.log(JSON.stringify(parsed, null, indent))
  }
})

export default quadletCommand
