import { describe, expect, test } from 'bun:test'
import { projectResourceName, isNamedVolume } from './naming'

describe('projectResourceName', () => {
  test('prefixes name with podName using underscore', () => {
    expect(projectResourceName('myapp', 'db')).toBe('myapp_db')
  })

  test('works with hyphenated names', () => {
    expect(projectResourceName('my-project', 'pg-data')).toBe('my-project_pg-data')
  })
})

describe('isNamedVolume', () => {
  test('returns true for plain volume names', () => {
    expect(isNamedVolume('pg_data')).toBe(true)
    expect(isNamedVolume('my-volume')).toBe(true)
    expect(isNamedVolume('data')).toBe(true)
  })

  test('returns false for relative bind mounts', () => {
    expect(isNamedVolume('./data')).toBe(false)
    expect(isNamedVolume('../config')).toBe(false)
  })

  test('returns false for absolute bind mounts', () => {
    expect(isNamedVolume('/var/data')).toBe(false)
  })

  test('returns false for home-relative bind mounts', () => {
    expect(isNamedVolume('~/data')).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isNamedVolume('')).toBe(false)
  })
})
