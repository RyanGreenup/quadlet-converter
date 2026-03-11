import { describe, expect, test } from 'bun:test'
import { composeVolumeToQuadletIR, resolveVolumeName } from './volumes'

describe('resolveVolumeName', () => {
  test('uses project_key when no explicit name', () => {
    expect(resolveVolumeName('myapp', 'pg_data', undefined)).toBe('myapp_pg_data')
    expect(resolveVolumeName('myapp', 'pg_data', null)).toBe('myapp_pg_data')
    expect(resolveVolumeName('myapp', 'pg_data', {})).toBe('myapp_pg_data')
  })

  test('uses explicit name when set', () => {
    expect(resolveVolumeName('myapp', 'pg_data', { name: 'custom-vol' })).toBe('custom-vol')
  })
})

describe('composeVolumeToQuadletIR', () => {
  test('bare volume name (undefined) generates IR with project-scoped VolumeName', () => {
    const ir = composeVolumeToQuadletIR('myapp', 'pg_data', undefined)
    expect(ir).toEqual({ Volume: [{ key: 'VolumeName', value: 'myapp_pg_data' }] })
  })

  test('null volume definition generates IR with project-scoped VolumeName', () => {
    const ir = composeVolumeToQuadletIR('myapp', 'pg_data', null)
    expect(ir).toEqual({ Volume: [{ key: 'VolumeName', value: 'myapp_pg_data' }] })
  })

  test('volume with explicit name uses that name', () => {
    const ir = composeVolumeToQuadletIR('myapp', 'data', { name: 'custom-vol' })
    expect(ir!.Volume).toContainEqual({ key: 'VolumeName', value: 'custom-vol' })
  })

  test('volume with driver includes Driver entry', () => {
    const ir = composeVolumeToQuadletIR('myapp', 'data', { driver: 'local' })
    expect(ir!.Volume).toContainEqual({ key: 'VolumeName', value: 'myapp_data' })
    expect(ir!.Volume).toContainEqual({ key: 'Driver', value: 'local' })
  })

  test('external volume returns null', () => {
    const ir = composeVolumeToQuadletIR('myapp', 'ext', { external: true })
    expect(ir).toBeNull()
  })

  test('volume with labels (object) includes Label entries', () => {
    const ir = composeVolumeToQuadletIR('myapp', 'data', {
      labels: { 'com.example.env': 'prod', 'com.example.app': 'myapp' },
    })
    expect(ir!.Volume).toContainEqual({ key: 'Label', value: 'com.example.env=prod' })
    expect(ir!.Volume).toContainEqual({ key: 'Label', value: 'com.example.app=myapp' })
  })

  test('volume with labels (array) includes Label entries', () => {
    const ir = composeVolumeToQuadletIR('myapp', 'data', {
      labels: ['com.example.env=prod'],
    })
    expect(ir!.Volume).toContainEqual({ key: 'Label', value: 'com.example.env=prod' })
  })

  test('empty object volume generates IR with project-scoped VolumeName', () => {
    const ir = composeVolumeToQuadletIR('myapp', 'data', {})
    expect(ir).toEqual({ Volume: [{ key: 'VolumeName', value: 'myapp_data' }] })
  })
})
