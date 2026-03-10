import type { ComposeFile, Service } from './compose/index.js'

export interface BuildDef {
  name: string
  image: string
  context: string
  dockerfile?: string
  target?: string
  args?: Record<string, string>
}

/** Extract BuildDef[] from a ComposeFile's services that have a build config. */
export function extractBuildDefs(compose: ComposeFile): BuildDef[] {
  if (!compose.services) return []
  const defs: BuildDef[] = []
  for (const [name, service] of Object.entries(compose.services)) {
    const def = serviceBuildDef(name, service)
    if (def) defs.push(def)
  }
  return defs
}

function serviceBuildDef(name: string, service: Service): BuildDef | null {
  if (!service.build) return null

  const image = service.image ?? `localhost/${name}`

  if (typeof service.build === 'string') {
    return { name, image, context: service.build }
  }

  const args: Record<string, string> = {}
  if (service.build.args) {
    if (Array.isArray(service.build.args)) {
      for (const arg of service.build.args) {
        const eq = arg.indexOf('=')
        if (eq !== -1) {
          args[arg.slice(0, eq)] = arg.slice(eq + 1)
        }
      }
    } else {
      for (const [k, v] of Object.entries(service.build.args)) {
        if (v != null) args[k] = String(v)
      }
    }
  }

  return {
    name,
    image,
    context: service.build.context ?? '.',
    ...(service.build.dockerfile && { dockerfile: service.build.dockerfile }),
    ...(service.build.target && { target: service.build.target }),
    ...(Object.keys(args).length > 0 && { args }),
  }
}

/** Resolve the image name for a service when --build is active. */
export function buildImage(name: string, service: Service): string {
  return service.image ?? `localhost/${name}`
}

/** Generate justfile content with podman build recipes. */
export function generateBuildJustfile(defs: BuildDef[]): string {
  if (defs.length === 0) return ''

  const lines: string[] = []

  for (const def of defs) {
    lines.push(`# Build image '${def.image}'`)
    lines.push(`build-${def.name}:`)

    const parts = ['podman build']
    if (def.dockerfile) {
      parts.push(`-f ${def.dockerfile}`)
    }
    if (def.target) {
      parts.push(`--target ${def.target}`)
    }
    if (def.args) {
      for (const [k, v] of Object.entries(def.args)) {
        parts.push(`--build-arg ${k}=${v}`)
      }
    }
    parts.push(`-t ${def.image}`)
    parts.push(def.context)

    lines.push(`    ${parts.join(' ')}`)
    lines.push('')
  }

  const buildDeps = defs.map(d => `build-${d.name}`).join(' ')
  lines.push(`# Build all images`)
  lines.push(`build: ${buildDeps}`)
  lines.push('')

  return lines.join('\n')
}
