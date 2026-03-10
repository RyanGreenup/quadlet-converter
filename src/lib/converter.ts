import type { Service } from './compose/index.js'
import type { ComposeFile } from './compose/index.js'
import type { QuadletIR, QuadletEntry } from './quadlet.js'

const restartToQuadlet: Record<string, string> = {
  'no': 'no',
  'always': 'always',
  'unless-stopped': 'always',
  'on-failure': 'on-failure',
}

const restartToCompose: Record<string, string> = {
  'no': 'no',
  'always': 'unless-stopped',
  'on-failure': 'on-failure',
}

/** Convert a single compose service to QuadletIR. */
export function composeServiceToQuadletIR(name: string, service: Service): QuadletIR {
  const container: QuadletEntry[] = []
  const svcSection: QuadletEntry[] = []

  if (service.image) {
    container.push({ key: 'Image', value: service.image })
  }

  if (service.network_mode) {
    container.push({ key: 'Network', value: service.network_mode })
  }

  if (service.ports) {
    for (const port of service.ports) {
      if (typeof port === 'string' || typeof port === 'number') {
        container.push({ key: 'PublishPort', value: String(port) })
      } else {
        // structured port config
        const parts: string[] = []
        if (port.host_ip) parts.push(port.host_ip + ':')
        else parts.push('')
        if (port.published != null) parts[parts.length - 1] += port.published
        parts[parts.length - 1] += ':' + (port.target ?? '')
        if (port.protocol && port.protocol !== 'tcp') {
          parts[parts.length - 1] += '/' + port.protocol
        }
        container.push({ key: 'PublishPort', value: parts.join('') })
      }
    }
  }

  if (service.volumes) {
    for (const vol of service.volumes) {
      if (typeof vol === 'string') {
        container.push({ key: 'Volume', value: vol })
      } else {
        // structured volume mount
        const parts = [vol.source ?? '', vol.target ?? '']
        if (vol.read_only) parts.push('ro')
        if (vol.bind?.selinux) parts.push(vol.bind.selinux)
        container.push({ key: 'Volume', value: parts.join(':') })
      }
    }
  }

  if (service.environment) {
    if (Array.isArray(service.environment)) {
      for (const env of service.environment) {
        container.push({ key: 'Environment', value: String(env) })
      }
    } else {
      for (const [k, v] of Object.entries(service.environment)) {
        container.push({ key: 'Environment', value: v != null ? `${k}=${v}` : k })
      }
    }
  }

  if (service.container_name) {
    container.push({ key: 'ContainerName', value: service.container_name })
  }

  if (service.restart) {
    const mapped = restartToQuadlet[service.restart] ?? service.restart
    svcSection.push({ key: 'Restart', value: mapped })
  }

  const ir: QuadletIR = {}
  if (container.length) ir['Container'] = container
  if (svcSection.length) ir['Service'] = svcSection

  return ir
}

/** Convert QuadletIR to a ComposeFile (single service). */
export function quadletIRToCompose(ir: QuadletIR, serviceName: string): ComposeFile {
  const service: Service = {}
  const containerEntries = ir['Container'] ?? []
  const serviceEntries = ir['Service'] ?? []

  for (const { key, value } of containerEntries) {
    switch (key) {
      case 'Image':
        service.image = value
        break
      case 'Network':
        service.network_mode = value
        break
      case 'PublishPort':
        if (!service.ports) service.ports = []
        service.ports.push(value)
        break
      case 'Volume':
        if (!service.volumes) service.volumes = []
        service.volumes.push(value)
        break
      case 'Environment':
        if (!service.environment) service.environment = [] as string[]
        ;(service.environment as string[]).push(value)
        break
      case 'ContainerName':
        service.container_name = value
        break
    }
  }

  for (const { key, value } of serviceEntries) {
    switch (key) {
      case 'Restart':
        service.restart = restartToCompose[value] ?? value
        break
    }
  }

  return {
    services: {
      [serviceName]: service,
    },
  }
}
