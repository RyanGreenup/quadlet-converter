import { describe, test, expect } from 'bun:test'
import { checkService, type CheckResult } from './checks.js'
import type { Service } from './compose/service.js'

function ids(results: CheckResult[]): string[] {
  return results.map(r => r.id)
}

function warnings(results: CheckResult[]): CheckResult[] {
  return results.filter(r => r.severity === 'warning')
}

function suggestions(results: CheckResult[]): CheckResult[] {
  return results.filter(r => r.severity === 'suggestion')
}

const minimal: Service = { image: 'alpine' }

describe('privileged', () => {
  test('warns when privileged is true', () => {
    expect(ids(checkService('s', { ...minimal, privileged: true }))).toContain('privileged')
  })

  test('warns when privileged is string "true"', () => {
    expect(ids(checkService('s', { ...minimal, privileged: 'true' }))).toContain('privileged')
  })

  test('does not warn when privileged is false', () => {
    expect(ids(checkService('s', { ...minimal, privileged: false }))).not.toContain('privileged')
  })
})

describe('network_mode: host', () => {
  test('warns when host', () => {
    expect(ids(checkService('s', { ...minimal, network_mode: 'host' }))).toContain('network-host')
  })

  test('does not warn for bridge', () => {
    expect(ids(checkService('s', { ...minimal, network_mode: 'bridge' }))).not.toContain('network-host')
  })
})

describe('pid: host', () => {
  test('warns when host', () => {
    expect(ids(checkService('s', { ...minimal, pid: 'host' }))).toContain('pid-host')
  })

  test('does not warn when unset', () => {
    expect(ids(checkService('s', minimal))).not.toContain('pid-host')
  })
})

describe('ipc: host', () => {
  test('warns when host', () => {
    expect(ids(checkService('s', { ...minimal, ipc: 'host' }))).toContain('ipc-host')
  })

  test('does not warn for private', () => {
    expect(ids(checkService('s', { ...minimal, ipc: 'private' }))).not.toContain('ipc-host')
  })
})

describe('security_opt MAC disable', () => {
  test('warns on label:disable', () => {
    expect(ids(checkService('s', { ...minimal, security_opt: ['label:disable'] }))).toContain('selinux-disable')
  })

  test('warns on apparmor:unconfined', () => {
    expect(ids(checkService('s', { ...minimal, security_opt: ['apparmor:unconfined'] }))).toContain('apparmor-unconfined')
  })

  test('does not warn on other security_opt', () => {
    const r = checkService('s', { ...minimal, security_opt: ['no-new-privileges'] })
    expect(ids(r)).not.toContain('selinux-disable')
    expect(ids(r)).not.toContain('apparmor-unconfined')
  })
})

describe('sensitive mount paths', () => {
  test('warns on /etc mount', () => {
    expect(ids(checkService('s', { ...minimal, volumes: ['/etc:/etc:ro'] }))).toContain('sensitive-mount')
  })

  test('warns on /etc/shadow (child of /etc)', () => {
    expect(ids(checkService('s', { ...minimal, volumes: ['/etc/shadow:/etc/shadow'] }))).toContain('sensitive-mount')
  })

  test('warns on docker socket', () => {
    expect(ids(checkService('s', { ...minimal, volumes: ['/var/run/docker.sock:/var/run/docker.sock'] }))).toContain('sensitive-mount')
  })

  test('warns on root mount /', () => {
    expect(ids(checkService('s', { ...minimal, volumes: ['/:/host'] }))).toContain('sensitive-mount')
  })

  test('does not warn on safe path', () => {
    const r = warnings(checkService('s', { ...minimal, volumes: ['/opt/data:/data'] }))
    expect(r.filter(w => w.id === 'sensitive-mount')).toHaveLength(0)
  })

  test('does not warn on /etcetera (not a child of /etc)', () => {
    const r = warnings(checkService('s', { ...minimal, volumes: ['/etcetera:/data'] }))
    expect(r.filter(w => w.id === 'sensitive-mount')).toHaveLength(0)
  })

  test('handles object-style volume', () => {
    const r = checkService('s', { ...minimal, volumes: [{ type: 'bind' as const, source: '/proc', target: '/host-proc' }] })
    expect(ids(r)).toContain('sensitive-mount')
  })
})

describe('dangerous capabilities', () => {
  test('warns on SYS_ADMIN', () => {
    expect(ids(checkService('s', { ...minimal, cap_add: ['SYS_ADMIN'] }))).toContain('dangerous-cap')
  })

  test('warns on ALL', () => {
    expect(ids(checkService('s', { ...minimal, cap_add: ['ALL'] }))).toContain('dangerous-cap')
  })

  test('case-insensitive match', () => {
    expect(ids(checkService('s', { ...minimal, cap_add: ['net_admin'] }))).toContain('dangerous-cap')
  })

  test('does not warn on safe cap', () => {
    const r = checkService('s', { ...minimal, cap_add: ['CHOWN'] })
    expect(r.filter(w => w.id === 'dangerous-cap')).toHaveLength(0)
  })
})

describe('restart without limits', () => {
  test('warns on restart always without limits', () => {
    expect(ids(checkService('s', { ...minimal, restart: 'always' }))).toContain('restart-no-limits')
  })

  test('does not warn with memory limit', () => {
    expect(ids(checkService('s', { ...minimal, restart: 'always', mem_limit: '512m' }))).not.toContain('restart-no-limits')
  })

  test('does not warn with deploy CPU limit', () => {
    const svc: Service = { ...minimal, restart: 'always', deploy: { resources: { limits: { cpus: '0.5' } } } }
    expect(ids(checkService('s', svc))).not.toContain('restart-no-limits')
  })

  test('does not warn for restart unless-stopped', () => {
    expect(ids(checkService('s', { ...minimal, restart: 'unless-stopped' }))).not.toContain('restart-no-limits')
  })
})

describe('SELinux volume labels', () => {
  test('warns on bind mount without label', () => {
    expect(ids(checkService('s', { ...minimal, volumes: ['/data:/data'] }))).toContain('selinux-label')
  })

  test('no warning with :Z label', () => {
    const r = checkService('s', { ...minimal, volumes: ['/data:/data:Z'] })
    expect(r.filter(w => w.id === 'selinux-label')).toHaveLength(0)
  })

  test('no warning with :z label', () => {
    const r = checkService('s', { ...minimal, volumes: ['/data:/data:z'] })
    expect(r.filter(w => w.id === 'selinux-label')).toHaveLength(0)
  })

  test('no warning with object-style selinux', () => {
    const r = checkService('s', { ...minimal, volumes: [{ type: 'bind' as const, source: '/data', target: '/data', bind: { selinux: 'Z' as const } }] })
    expect(r.filter(w => w.id === 'selinux-label')).toHaveLength(0)
  })

  test('does not warn on named volume', () => {
    const r = checkService('s', { ...minimal, volumes: ['myvolume:/data'] })
    expect(r.filter(w => w.id === 'selinux-label')).toHaveLength(0)
  })
})

describe('suggestions', () => {
  test('suggests read_only when not set', () => {
    expect(ids(checkService('s', minimal))).toContain('no-read-only')
  })

  test('no suggestion when read_only is true', () => {
    expect(ids(checkService('s', { ...minimal, read_only: true }))).not.toContain('no-read-only')
  })

  test('suggests memory limit when not set', () => {
    expect(ids(checkService('s', minimal))).toContain('no-memory-limit')
  })

  test('no memory suggestion with mem_limit', () => {
    expect(ids(checkService('s', { ...minimal, mem_limit: '512m' }))).not.toContain('no-memory-limit')
  })

  test('no memory suggestion with deploy limits', () => {
    const svc: Service = { ...minimal, deploy: { resources: { limits: { memory: '512m' } } } }
    expect(ids(checkService('s', svc))).not.toContain('no-memory-limit')
  })

  test('suggests CPU limit when not set', () => {
    expect(ids(checkService('s', minimal))).toContain('no-cpu-limit')
  })

  test('no CPU suggestion with cpus set', () => {
    expect(ids(checkService('s', { ...minimal, cpus: 0.5 }))).not.toContain('no-cpu-limit')
  })

  test('suggests healthcheck when not set', () => {
    expect(ids(checkService('s', minimal))).toContain('no-healthcheck')
  })

  test('no healthcheck suggestion when defined', () => {
    expect(ids(checkService('s', { ...minimal, healthcheck: { test: ['CMD', 'true'] } }))).not.toContain('no-healthcheck')
  })

  test('suggests healthcheck when test is NONE', () => {
    expect(ids(checkService('s', { ...minimal, healthcheck: { test: ['NONE'] } }))).toContain('no-healthcheck')
  })

  test('suggests no-new-privileges when absent', () => {
    expect(ids(checkService('s', minimal))).toContain('no-new-privileges')
  })

  test('no suggestion when no-new-privileges present', () => {
    expect(ids(checkService('s', { ...minimal, security_opt: ['no-new-privileges'] }))).not.toContain('no-new-privileges')
  })

  test('no suggestion when no-new-privileges:true present', () => {
    expect(ids(checkService('s', { ...minimal, security_opt: ['no-new-privileges:true'] }))).not.toContain('no-new-privileges')
  })

  test('suggests userns_mode when not set', () => {
    expect(ids(checkService('s', minimal))).toContain('no-userns')
  })

  test('no userns suggestion when set', () => {
    expect(ids(checkService('s', { ...minimal, userns_mode: 'host' }))).not.toContain('no-userns')
  })
})
