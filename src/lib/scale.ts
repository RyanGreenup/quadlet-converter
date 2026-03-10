import type { Service } from './compose/index.js'
import type { QuadletFileSet } from './converter.js'
import { composeServiceToQuadletIR, portEntries } from './converter.js'

/**
 * Parse a port string and add `offset` to the host port.
 * Target port is unchanged.
 *
 * Examples:
 *   "8080:80" + offset 2 → "8082:80"
 *   "0.0.0.0:8080:80" + offset 1 → "0.0.0.0:8081:80"
 *   "8080:80/udp" + offset 3 → "8083:80/udp"
 *   "80" (no host port) → unchanged
 */
export function rewriteHostPort(portSpec: string, offset: number): string {
  if (offset === 0) return portSpec

  // Extract protocol suffix if present
  let protocol = ''
  let spec = portSpec
  const slashIdx = spec.lastIndexOf('/')
  if (slashIdx !== -1) {
    protocol = spec.slice(slashIdx)
    spec = spec.slice(0, slashIdx)
  }

  const parts = spec.split(':')

  if (parts.length === 1) {
    // Just a container port "80" — no host port to rewrite
    return portSpec
  }

  if (parts.length === 2) {
    // "hostPort:containerPort"
    const hostPort = parseInt(parts[0], 10)
    return `${hostPort + offset}:${parts[1]}${protocol}`
  }

  if (parts.length === 3) {
    // "hostIp:hostPort:containerPort"
    const hostPort = parseInt(parts[1], 10)
    return `${parts[0]}:${hostPort + offset}:${parts[2]}${protocol}`
  }

  return portSpec
}

/** Rewrite all ports on a service clone with the given offset and optional startPort override. */
function rewriteServicePorts(service: Service, offset: number, startPort?: number): Service {
  if (!service.ports || service.ports.length === 0) return service

  const newPorts = service.ports.map((port, idx) => {
    if (typeof port === 'number') {
      // Just a container port — no host port
      return port
    }
    if (typeof port === 'string') {
      if (startPort != null && idx === 0) {
        // Replace first port's host port with startPort + offset
        return rewriteFirstHostPort(port, startPort + offset)
      }
      return rewriteHostPort(port, offset)
    }
    // Structured port object
    if (port.published != null) {
      const published = typeof port.published === 'string'
        ? parseInt(port.published, 10)
        : port.published
      if (startPort != null && idx === 0) {
        return { ...port, published: startPort + offset }
      }
      return { ...port, published: published + offset }
    }
    return port
  })

  return { ...service, ports: newPorts }
}

/** Replace the host port in a port string with a specific value. */
function rewriteFirstHostPort(portSpec: string, hostPort: number): string {
  let protocol = ''
  let spec = portSpec
  const slashIdx = spec.lastIndexOf('/')
  if (slashIdx !== -1) {
    protocol = spec.slice(slashIdx)
    spec = spec.slice(0, slashIdx)
  }

  const parts = spec.split(':')

  if (parts.length === 1) {
    // No host port — add one
    return `${hostPort}:${parts[0]}${protocol}`
  }

  if (parts.length === 2) {
    return `${hostPort}:${parts[1]}${protocol}`
  }

  if (parts.length === 3) {
    return `${parts[0]}:${hostPort}:${parts[2]}${protocol}`
  }

  return portSpec
}

export interface ScaleOpts {
  startPort?: number
  usePod?: boolean
  build?: boolean
}

/** Scale a service into multiple instances, each with its own pod or standalone container. */
export function scaleService(
  name: string,
  service: Service,
  count: number,
  opts: ScaleOpts = {},
): QuadletFileSet {
  const usePod = opts.usePod ?? true
  const files: QuadletFileSet = []

  for (let i = 1; i <= count; i++) {
    const instanceName = `${name}-${i}`
    const offset = i - 1
    const rewritten = rewriteServicePorts(service, offset, opts.startPort)
    // Clear container_name so instances don't collide
    const instanceService = { ...rewritten, container_name: undefined }

    if (usePod) {
      // Pod mode: pod file with ports, container without ports
      const podFile = `${instanceName}.pod`
      const podPorts = portEntries(instanceService)
      const podIR: Record<string, { key: string; value: string }[]> = {
        Pod: [{ key: 'PodName', value: instanceName }],
      }
      if (podPorts.length) {
        podIR.Pod.push(...podPorts)
      }
      files.push({ filename: podFile, ir: podIR })

      const containerIR = composeServiceToQuadletIR(instanceName, instanceService, {
        omitPorts: true,
        pod: podFile,
        build: opts.build,
      })
      files.push({ filename: `${instanceName}.container`, ir: containerIR })
    } else {
      // Standalone mode: container with ports
      const containerIR = composeServiceToQuadletIR(instanceName, instanceService, {
        build: opts.build,
      })
      files.push({ filename: `${instanceName}.container`, ir: containerIR })
    }
  }

  return files
}
