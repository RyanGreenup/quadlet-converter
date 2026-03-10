import { describe, expect, test } from 'bun:test'
import { rewriteHostPort, scaleService } from './scale'
import type { Service } from './compose/index'

describe('rewriteHostPort', () => {
  test('rewrites host:container port', () => {
    expect(rewriteHostPort('8080:80', 2)).toBe('8082:80')
  })

  test('rewrites ip:host:container port', () => {
    expect(rewriteHostPort('0.0.0.0:8080:80', 1)).toBe('0.0.0.0:8081:80')
  })

  test('rewrites port with protocol suffix', () => {
    expect(rewriteHostPort('8080:80/udp', 3)).toBe('8083:80/udp')
  })

  test('leaves container-only port unchanged', () => {
    expect(rewriteHostPort('80', 5)).toBe('80')
  })

  test('offset 0 returns unchanged', () => {
    expect(rewriteHostPort('8080:80', 0)).toBe('8080:80')
  })
})

describe('scaleService', () => {
  const baseService: Service = {
    image: 'nginx:latest',
    ports: ['8080:80'],
  }

  test('pod mode generates pod + container per instance', () => {
    const files = scaleService('web', baseService, 3)

    expect(files).toHaveLength(6) // 3 pods + 3 containers
    expect(files.map(f => f.filename)).toEqual([
      'web-1.pod', 'web-1.container',
      'web-2.pod', 'web-2.container',
      'web-3.pod', 'web-3.container',
    ])

    // First pod has original port
    expect(files[0].ir.Pod).toContainEqual({ key: 'PublishPort', value: '8080:80' })
    // Second pod has offset port
    expect(files[2].ir.Pod).toContainEqual({ key: 'PublishPort', value: '8081:80' })
    // Third pod has offset port
    expect(files[4].ir.Pod).toContainEqual({ key: 'PublishPort', value: '8082:80' })

    // Containers reference their pod and omit ports
    expect(files[1].ir.Container).toContainEqual({ key: 'Pod', value: 'web-1.pod' })
    expect(files[3].ir.Container).toContainEqual({ key: 'Pod', value: 'web-2.pod' })
    const containerPorts = files[1].ir.Container?.filter(e => e.key === 'PublishPort') ?? []
    expect(containerPorts).toHaveLength(0)
  })

  test('standalone mode generates containers with ports', () => {
    const files = scaleService('web', baseService, 3, { usePod: false })

    expect(files).toHaveLength(3)
    expect(files.map(f => f.filename)).toEqual([
      'web-1.container',
      'web-2.container',
      'web-3.container',
    ])

    expect(files[0].ir.Container).toContainEqual({ key: 'PublishPort', value: '8080:80' })
    expect(files[1].ir.Container).toContainEqual({ key: 'PublishPort', value: '8081:80' })
    expect(files[2].ir.Container).toContainEqual({ key: 'PublishPort', value: '8082:80' })
  })

  test('startPort overrides first port', () => {
    const files = scaleService('web', baseService, 3, { startPort: 9000 })

    expect(files[0].ir.Pod).toContainEqual({ key: 'PublishPort', value: '9000:80' })
    expect(files[2].ir.Pod).toContainEqual({ key: 'PublishPort', value: '9001:80' })
    expect(files[4].ir.Pod).toContainEqual({ key: 'PublishPort', value: '9002:80' })
  })

  test('scale 1 produces single instance', () => {
    const files = scaleService('web', baseService, 1)

    expect(files).toHaveLength(2) // 1 pod + 1 container
    expect(files[0].filename).toBe('web-1.pod')
    expect(files[1].filename).toBe('web-1.container')
  })

  test('service with no ports scales without port entries', () => {
    const service: Service = { image: 'worker:latest' }
    const files = scaleService('worker', service, 2)

    expect(files).toHaveLength(4) // 2 pods + 2 containers
    const podPorts = files[0].ir.Pod?.filter(e => e.key === 'PublishPort') ?? []
    expect(podPorts).toHaveLength(0)
  })

  test('container_name is cleared on instances', () => {
    const service: Service = {
      image: 'nginx:latest',
      container_name: 'my-nginx',
      ports: ['8080:80'],
    }
    const files = scaleService('web', service, 2, { usePod: false })

    for (const file of files) {
      const containerNames = file.ir.Container?.filter(e => e.key === 'ContainerName') ?? []
      expect(containerNames).toHaveLength(0)
    }
  })
})
