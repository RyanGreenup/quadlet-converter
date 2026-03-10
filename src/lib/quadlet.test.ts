import { describe, expect, test } from 'bun:test'
import { parseQuadlet, serializeQuadlet, toQuadletIR, type QuadletData } from './quadlet'

describe('parseQuadlet', () => {
  test('parses sections and key-value pairs', () => {
    const input = `[Container]
Image=caddy:2
Network=host

[Service]
Restart=always
`
    expect(parseQuadlet(input)).toEqual({
      Container: { Image: 'caddy:2', Network: 'host' },
      Service: { Restart: 'always' },
    })
  })

  test('groups repeated keys into arrays', () => {
    const input = `[Container]
Volume=./a:/a:Z
Volume=./b:/b:Z
Volume=./c:/c:Z
`
    expect(parseQuadlet(input)).toEqual({
      Container: { Volume: ['./a:/a:Z', './b:/b:Z', './c:/c:Z'] },
    })
  })

  test('skips comments and blank lines', () => {
    const input = `# comment
; another comment

[Container]
Image=nginx
`
    expect(parseQuadlet(input)).toEqual({
      Container: { Image: 'nginx' },
    })
  })

  test('ignores lines before any section header', () => {
    const input = `orphan=value
[Container]
Image=nginx
`
    expect(parseQuadlet(input)).toEqual({
      Container: { Image: 'nginx' },
    })
  })

  test('handles values containing equals signs', () => {
    const input = `[Container]
Environment=FOO=bar=baz
`
    expect(parseQuadlet(input)).toEqual({
      Container: { Environment: 'FOO=bar=baz' },
    })
  })
})

describe('serializeQuadlet', () => {
  test('serializes simple key-value pairs', () => {
    const data: QuadletData = {
      Container: { Image: 'caddy:2', Network: 'host' },
    }
    expect(serializeQuadlet(data)).toBe(
      `[Container]\nImage=caddy:2\nNetwork=host\n`
    )
  })

  test('expands arrays into repeated keys', () => {
    const data: QuadletData = {
      Container: { Volume: ['./a:/a:Z', './b:/b:Z'] },
    }
    expect(serializeQuadlet(data)).toBe(
      `[Container]\nVolume=./a:/a:Z\nVolume=./b:/b:Z\n`
    )
  })

  test('separates sections with blank lines', () => {
    const data: QuadletData = {
      Container: { Image: 'nginx' },
      Service: { Restart: 'always' },
    }
    expect(serializeQuadlet(data)).toBe(
      `[Container]\nImage=nginx\n\n[Service]\nRestart=always\n`
    )
  })
})

describe('toQuadletIR', () => {
  test('converts simple values to entries', () => {
    const data: QuadletData = {
      Container: { Image: 'nginx', Network: 'host' },
    }
    expect(toQuadletIR(data)).toEqual({
      Container: [
        { key: 'Image', value: 'nginx' },
        { key: 'Network', value: 'host' },
      ],
    })
  })

  test('expands repeated keys into separate entries', () => {
    const data: QuadletData = {
      Container: { Volume: ['./a:/a:Z', './b:/b:Z'] },
    }
    expect(toQuadletIR(data)).toEqual({
      Container: [
        { key: 'Volume', value: './a:/a:Z' },
        { key: 'Volume', value: './b:/b:Z' },
      ],
    })
  })

  test('handles multiple sections', () => {
    const data: QuadletData = {
      Container: { Image: 'nginx' },
      Service: { Restart: 'always' },
    }
    const ir = toQuadletIR(data)
    expect(Object.keys(ir)).toEqual(['Container', 'Service'])
    expect(ir.Service).toEqual([{ key: 'Restart', value: 'always' }])
  })
})

describe('round-trip', () => {
  test('parse then serialize preserves data', () => {
    const input = `[Container]
Image=caddy:2
Network=host
PublishPort=0.0.0.0:80:80
PublishPort=0.0.0.0:443:443

[Service]
Restart=always
CPUQuota=200%
`
    const roundTripped = serializeQuadlet(parseQuadlet(input))
    expect(roundTripped).toBe(input)
  })

  test('serialize then parse preserves data', () => {
    const data: QuadletData = {
      Unit: { Description: 'My Service' },
      Container: {
        Image: 'nginx:latest',
        PublishPort: ['8080:80', '8443:443'],
      },
      Service: { Restart: 'on-failure' },
    }
    const parsed = parseQuadlet(serializeQuadlet(data))
    expect(parsed).toEqual(data)
  })
})
