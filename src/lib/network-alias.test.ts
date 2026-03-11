import { describe, test, expect } from 'bun:test'
import { canUseNetworkAlias } from './network-alias.js'

describe('canUseNetworkAlias', () => {
  test('returns true when no network_mode is set', () => {
    expect(canUseNetworkAlias({ image: 'nginx' })).toBe(true)
  })

  test('returns true for bridge network mode', () => {
    expect(canUseNetworkAlias({ image: 'nginx', network_mode: 'bridge' })).toBe(true)
  })

  test('returns false for host network mode', () => {
    expect(canUseNetworkAlias({ image: 'nginx', network_mode: 'host' })).toBe(false)
  })

  test('returns false for none network mode', () => {
    expect(canUseNetworkAlias({ image: 'nginx', network_mode: 'none' })).toBe(false)
  })

  test('returns false for slirp4netns network mode', () => {
    expect(canUseNetworkAlias({ image: 'nginx', network_mode: 'slirp4netns' })).toBe(false)
  })

  test('returns false for pasta network mode', () => {
    expect(canUseNetworkAlias({ image: 'nginx', network_mode: 'pasta' })).toBe(false)
  })

  test('returns false for container:name network mode', () => {
    expect(canUseNetworkAlias({ image: 'nginx', network_mode: 'container:other' })).toBe(false)
  })

  test('returns false for service:name network mode', () => {
    expect(canUseNetworkAlias({ image: 'nginx', network_mode: 'service:web' })).toBe(false)
  })

  test('returns true when service has named networks', () => {
    expect(canUseNetworkAlias({ image: 'nginx', networks: ['app', 'monitoring'] })).toBe(true)
  })

  test('returns false for host network mode even with named networks', () => {
    expect(canUseNetworkAlias({ image: 'nginx', network_mode: 'host', networks: ['app'] })).toBe(false)
  })
})
