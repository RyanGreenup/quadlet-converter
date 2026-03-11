import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'

/** Try to inspect a volume by name, return its mountpoint or null. */
async function inspectVolume(name: string): Promise<string | null> {
  const proc = Bun.spawn(['podman', 'volume', 'inspect', '--format', '{{.Mountpoint}}', name], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) return null
  const mountpoint = (await new Response(proc.stdout).text()).trim()
  return mountpoint || null
}

const volumePathCommand = defineCommand({
  name: 'volume-path',
  description: 'Get the mountpoint of a volume by name, trying prefixed variants',
  options: {
    project: option(
      z.string().optional(),
      { description: 'Project name to try as prefix', short: 'p' },
    ),
  },
  handler: async ({ flags, positional }) => {
    const volume = positional[0]
    if (!volume) {
      console.error('Error: please provide a volume name')
      process.exit(1)
    }

    // Try the exact name first
    const candidates = [volume]

    // If a project is given, try project_volume
    if (flags.project) {
      candidates.push(`${flags.project}_${volume}`)
    }

    // Also try discovering the project from running containers and trying prefixed names
    if (!flags.project) {
      const proc = Bun.spawn(['podman', 'volume', 'ls', '--format', '{{.Name}}'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode === 0) {
        const allVolumes = (await new Response(proc.stdout).text()).trim().split('\n').filter(Boolean)
        // Find volumes ending with _<volume> that we haven't already listed
        for (const v of allVolumes) {
          if (v.endsWith(`_${volume}`) && !candidates.includes(v)) {
            candidates.push(v)
          }
        }
      }
    }

    for (const candidate of candidates) {
      const mountpoint = await inspectVolume(candidate)
      if (mountpoint) {
        console.log(mountpoint)
        return
      }
    }

    console.error(`No volume found for "${volume}" (tried: ${candidates.join(', ')})`)
    process.exit(1)
  },
})

export default volumePathCommand
