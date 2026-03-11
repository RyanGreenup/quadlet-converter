/** Prefix a resource name with the project (pod) name, using underscore for compose parity. */
export function projectResourceName(podName: string, name: string): string {
  return `${podName}_${name}`
}

/** True when the volume source refers to a named volume (not a bind mount). */
export function isNamedVolume(source: string): boolean {
  return source !== '' && !source.startsWith('.') && !source.startsWith('/') && !source.startsWith('~')
}
