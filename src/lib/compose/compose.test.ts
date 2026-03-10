import { describe, expect, it } from 'bun:test'
import { parseCompose, safeParseCompose, ComposeFileSchema } from './index.js'

describe('parseCompose', () => {
  it('parses an empty object', () => {
    const result = parseCompose('')
    expect(result).toEqual({})
  })

  it('parses minimal services', () => {
    const result = parseCompose('services: {}')
    expect(result).toEqual({ services: {} })
  })

  it('parses a simple service with image', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
`
    const result = parseCompose(yaml)
    expect(result.services?.web.image).toBe('nginx:latest')
    expect(result.services?.web.ports).toEqual(['80:80'])
  })

  it('parses volumes as null (use defaults)', () => {
    const yaml = `
volumes:
  data:
`
    const result = parseCompose(yaml)
    expect(result.volumes?.data).toBeNull()
  })

  it('parses networks as null (use defaults)', () => {
    const yaml = `
networks:
  frontend:
`
    const result = parseCompose(yaml)
    expect(result.networks?.frontend).toBeNull()
  })

  it('parses environment as dict', () => {
    const yaml = `
services:
  app:
    image: app:1
    environment:
      FOO: bar
      NUM: 42
`
    const result = parseCompose(yaml)
    expect(result.services?.app.environment).toEqual({ FOO: 'bar', NUM: 42 })
  })

  it('parses environment as list', () => {
    const yaml = `
services:
  app:
    image: app:1
    environment:
      - FOO=bar
      - BAZ=qux
`
    const result = parseCompose(yaml)
    expect(result.services?.app.environment).toEqual(['FOO=bar', 'BAZ=qux'])
  })

  it('parses ports as numbers', () => {
    const yaml = `
services:
  app:
    image: app:1
    ports:
      - 8080
`
    const result = parseCompose(yaml)
    expect(result.services?.app.ports).toEqual([8080])
  })

  it('parses ports as objects', () => {
    const yaml = `
services:
  app:
    image: app:1
    ports:
      - target: 80
        published: 8080
        protocol: tcp
`
    const result = parseCompose(yaml)
    expect(result.services?.app.ports?.[0]).toEqual({
      target: 80,
      published: 8080,
      protocol: 'tcp',
    })
  })

  it('parses build as string', () => {
    const yaml = `
services:
  app:
    build: ./app
`
    const result = parseCompose(yaml)
    expect(result.services?.app.build).toBe('./app')
  })

  it('parses build as object', () => {
    const yaml = `
services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile.prod
      target: production
`
    const result = parseCompose(yaml)
    const build = result.services?.app.build as Record<string, unknown>
    expect(build.context).toBe('./app')
    expect(build.dockerfile).toBe('Dockerfile.prod')
    expect(build.target).toBe('production')
  })

  it('parses depends_on as list', () => {
    const yaml = `
services:
  web:
    image: web:1
    depends_on:
      - db
      - redis
`
    const result = parseCompose(yaml)
    expect(result.services?.web.depends_on).toEqual(['db', 'redis'])
  })

  it('parses depends_on as object with conditions', () => {
    const yaml = `
services:
  web:
    image: web:1
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
`
    const result = parseCompose(yaml)
    const deps = result.services?.web.depends_on as Record<string, unknown>
    expect((deps.db as Record<string, string>).condition).toBe('service_healthy')
  })

  it('parses deploy with resources', () => {
    const yaml = `
services:
  app:
    image: app:1
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
`
    const result = parseCompose(yaml)
    const limits = (result.services?.app.deploy as any)?.resources?.limits
    expect(limits.cpus).toBe('1.0')
    expect(limits.memory).toBe('512M')
  })

  it('parses volumes as string mounts', () => {
    const yaml = `
services:
  app:
    image: app:1
    volumes:
      - ./data:/app/data:Z
      - named_vol:/app/cache
`
    const result = parseCompose(yaml)
    expect(result.services?.app.volumes).toEqual([
      './data:/app/data:Z',
      'named_vol:/app/cache',
    ])
  })

  it('parses volume mounts as objects', () => {
    const yaml = `
services:
  app:
    image: app:1
    volumes:
      - type: bind
        source: ./data
        target: /app/data
        bind:
          selinux: Z
`
    const result = parseCompose(yaml)
    const vol = result.services?.app.volumes?.[0] as Record<string, unknown>
    expect(vol.type).toBe('bind')
    expect(vol.source).toBe('./data')
    expect((vol.bind as Record<string, string>).selinux).toBe('Z')
  })

  it('preserves x- extension fields', () => {
    const yaml = `
x-common: &common
  restart: unless-stopped
services:
  app:
    image: app:1
    x-custom: hello
`
    const result = parseCompose(yaml)
    expect((result as any)['x-common']).toEqual({ restart: 'unless-stopped' })
    expect((result.services?.app as any)['x-custom']).toBe('hello')
  })

  it('parses version field', () => {
    const yaml = `
version: "3.8"
services: {}
`
    const result = parseCompose(yaml)
    expect(result.version).toBe('3.8')
  })

  it('parses secrets definition', () => {
    const yaml = `
secrets:
  my_secret:
    file: ./secret.txt
`
    const result = parseCompose(yaml)
    expect(result.secrets?.my_secret.file).toBe('./secret.txt')
  })

  it('parses configs definition', () => {
    const yaml = `
configs:
  my_config:
    file: ./config.txt
`
    const result = parseCompose(yaml)
    expect(result.configs?.my_config.file).toBe('./config.txt')
  })

  it('parses healthcheck', () => {
    const yaml = `
services:
  app:
    image: app:1
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
      interval: 30s
      timeout: 10s
      retries: 3
`
    const result = parseCompose(yaml)
    const hc = result.services?.app.healthcheck as Record<string, unknown>
    expect(hc.test).toEqual(['CMD', 'curl', '-f', 'http://localhost'])
    expect(hc.interval).toBe('30s')
    expect(hc.retries).toBe(3)
  })

  it('parses command as string', () => {
    const yaml = `
services:
  app:
    image: app:1
    command: "npm start"
`
    const result = parseCompose(yaml)
    expect(result.services?.app.command).toBe('npm start')
  })

  it('parses command as array', () => {
    const yaml = `
services:
  app:
    image: app:1
    command: ["npm", "start"]
`
    const result = parseCompose(yaml)
    expect(result.services?.app.command).toEqual(['npm', 'start'])
  })

  it('parses service networks as object', () => {
    const yaml = `
services:
  app:
    image: app:1
    networks:
      frontend:
        aliases:
          - app-alias
        ipv4_address: 172.16.238.10
`
    const result = parseCompose(yaml)
    const nets = result.services?.app.networks as Record<string, any>
    expect(nets.frontend.aliases).toEqual(['app-alias'])
    expect(nets.frontend.ipv4_address).toBe('172.16.238.10')
  })

  it('parses ulimits', () => {
    const yaml = `
services:
  app:
    image: app:1
    ulimits:
      nofile:
        soft: 1024
        hard: 2048
      nproc: 65535
`
    const result = parseCompose(yaml)
    const ulimits = result.services?.app.ulimits as Record<string, any>
    expect(ulimits.nofile.soft).toBe(1024)
    expect(ulimits.nproc).toBe(65535)
  })

  it('parses extra_hosts as list', () => {
    const yaml = `
services:
  app:
    image: app:1
    extra_hosts:
      - "host.docker.internal:host-gateway"
`
    const result = parseCompose(yaml)
    expect(result.services?.app.extra_hosts).toEqual(['host.docker.internal:host-gateway'])
  })

  it('parses env_file as string', () => {
    const yaml = `
services:
  app:
    image: app:1
    env_file: .env
`
    const result = parseCompose(yaml)
    expect(result.services?.app.env_file).toBe('.env')
  })

  it('parses env_file as array of objects', () => {
    const yaml = `
services:
  app:
    image: app:1
    env_file:
      - path: .env
        required: false
`
    const result = parseCompose(yaml)
    const envFiles = result.services?.app.env_file as Array<Record<string, unknown>>
    expect(envFiles[0].path).toBe('.env')
    expect(envFiles[0].required).toBe(false)
  })
})

describe('safeParseCompose', () => {
  it('returns success for valid input', () => {
    const result = safeParseCompose('services: {}')
    expect(result.success).toBe(true)
  })

  it('returns error for invalid service property types', () => {
    const result = safeParseCompose(`
services:
  app:
    image: 12345
`)
    expect(result.success).toBe(false)
  })
})

describe('example files', () => {
  it('parses data/examples/0/docker-compose.yml', async () => {
    const text = await Bun.file('data/examples/0/docker-compose.yml').text()
    const result = parseCompose(text)
    expect(result.services).toBeDefined()
    expect(Object.keys(result.services!).length).toBeGreaterThan(0)
  })

  it('parses data/examples/2/docker-compose.yml with volumes and cap_add', async () => {
    const text = await Bun.file('data/examples/2/docker-compose.yml').text()
    const result = parseCompose(text)
    expect(result.services?.['my-caddy'].cap_add).toEqual(['NET_BIND_SERVICE'])
    expect(result.volumes).toBeDefined()
  })

  it('parses data/examples/10/docker-compose.yml with build and env_file', async () => {
    const text = await Bun.file('data/examples/10/docker-compose.yml').text()
    const result = parseCompose(text)
    expect(result.services?.gfmdata.build).toBe('.')
    expect(result.services?.gfmdata.env_file).toBeDefined()
  })

  it('parses data/examples/50/docker-compose.yml with extra_hosts', async () => {
    const text = await Bun.file('data/examples/50/docker-compose.yml').text()
    const result = parseCompose(text)
    expect(result.services?.caddy.extra_hosts).toBeDefined()
  })
})
