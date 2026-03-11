import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'

interface PodmanContainer {
  Id: string
  Names: string[]
  State: string
  Status: string
  Labels: Record<string, string>
}

interface QuadletContainer {
  project: string
  service: string
  container: string
  status: string
  unit: string
}

function parseContainers(raw: PodmanContainer[]): QuadletContainer[] {
  const results: QuadletContainer[] = []
  for (const c of raw) {
    const project = c.Labels?.['io.podman.quadlet.project']
    const service = c.Labels?.['io.podman.quadlet.service']
    if (!project || !service) continue
    results.push({
      project,
      service,
      container: c.Names?.[0] ?? c.Id.slice(0, 12),
      status: c.Status ?? c.State ?? 'unknown',
      unit: c.Labels?.['PODMAN_SYSTEMD_UNIT'] ?? '',
    })
  }
  return results
}

function groupByProject(containers: QuadletContainer[]): Map<string, QuadletContainer[]> {
  const groups = new Map<string, QuadletContainer[]>()
  for (const c of containers) {
    let group = groups.get(c.project)
    if (!group) {
      group = []
      groups.set(c.project, group)
    }
    group.push(c)
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.service.localeCompare(b.service))
  }
  return groups
}

function padRight(str: string, len: number): string {
  return str + ' '.repeat(Math.max(0, len - str.length))
}

function printTable(containers: QuadletContainer[]) {
  const cols = {
    service: Math.max(7, ...containers.map(c => c.service.length)),
    container: Math.max(9, ...containers.map(c => c.container.length)),
    status: Math.max(6, ...containers.map(c => c.status.length)),
    unit: Math.max(4, ...containers.map(c => c.unit.length)),
  }

  const header = `  ${padRight('SERVICE', cols.service)}  ${padRight('CONTAINER', cols.container)}  ${padRight('STATUS', cols.status)}  UNIT`
  console.log(header)

  for (const c of containers) {
    const line = `  ${padRight(c.service, cols.service)}  ${padRight(c.container, cols.container)}  ${padRight(c.status, cols.status)}  ${c.unit}`
    console.log(line)
  }
}

const psCommand = defineCommand({
  name: 'ps',
  description: 'List running quadlet containers',
  options: {
    all: option(
      z.boolean().default(false),
      { description: 'Show all containers (including non-quadlet)', short: 'a' },
    ),
    project: option(
      z.string().optional(),
      { description: 'Filter by project name', short: 'p' },
    ),
    json: option(
      z.boolean().default(false),
      { description: 'Output as JSON' },
    ),
  },
  handler: async ({ flags }) => {
    const args = ['podman', 'container', 'ls', '--format', 'json']
    if (flags.all) args.push('--all')

    const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      console.error(`Error running podman: ${stderr.trim()}`)
      process.exit(1)
    }

    const stdout = await new Response(proc.stdout).text()
    const raw: PodmanContainer[] = stdout.trim() ? JSON.parse(stdout) : []

    let quadletContainers = parseContainers(raw)

    if (flags.project) {
      quadletContainers = quadletContainers.filter(c => c.project === flags.project)
    }

    if (flags.json) {
      console.log(JSON.stringify(quadletContainers, null, 2))
      return
    }

    if (quadletContainers.length === 0) {
      console.log('No quadlet containers found.')
      return
    }

    const groups = groupByProject(quadletContainers)
    let first = true
    for (const [project, containers] of groups) {
      if (!first) console.log()
      first = false
      console.log(project)
      printTable(containers)
    }

    if (flags.all) {
      const nonQuadlet = raw.filter(c => !c.Labels?.['io.podman.quadlet.project'])
      if (nonQuadlet.length > 0) {
        console.log('\nOther containers')
        const cols = {
          name: Math.max(4, ...nonQuadlet.map(c => (c.Names?.[0] ?? c.Id.slice(0, 12)).length)),
          status: Math.max(6, ...nonQuadlet.map(c => (c.Status ?? c.State ?? '').length)),
        }
        console.log(`  ${padRight('NAME', cols.name)}  STATUS`)
        for (const c of nonQuadlet) {
          const name = c.Names?.[0] ?? c.Id.slice(0, 12)
          const status = c.Status ?? c.State ?? ''
          console.log(`  ${padRight(name, cols.name)}  ${status}`)
        }
      }
    }
  },
})

export default psCommand
