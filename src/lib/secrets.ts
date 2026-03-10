import type { ComposeFile } from './compose/index.js'

export interface SecretDef {
  name: string
  file?: string
  environment?: string
  external?: boolean
}

/** Extract SecretDef[] from a ComposeFile's top-level secrets. */
export function extractSecretDefs(compose: ComposeFile): SecretDef[] {
  if (!compose.secrets) return []
  return Object.entries(compose.secrets).map(([name, secret]) => ({
    name,
    ...(secret.file && { file: secret.file }),
    ...(secret.environment && { environment: secret.environment }),
    ...(secret.external && { external: true }),
  }))
}

/** Generate justfile content with podman secret CRUD recipes. */
export function generateSecretsJustfile(secrets: SecretDef[]): string {
  if (secrets.length === 0) return ''

  const lines: string[] = []

  for (const secret of secrets) {
    lines.push(`# Create secret '${secret.name}'`)
    if (secret.file) {
      lines.push(`create-secret-${secret.name}:`)
      lines.push(`    podman secret create ${secret.name} ${secret.file}`)
    } else if (secret.environment) {
      lines.push(`create-secret-${secret.name}:`)
      lines.push(`    printenv ${secret.environment} | podman secret create ${secret.name} -`)
    } else if (secret.external) {
      lines.push(`# External secret — must already exist in podman`)
      lines.push(`create-secret-${secret.name}:`)
      lines.push(`    @echo "Secret '${secret.name}' is external; skipping creation"`)
    }
    lines.push('')

    lines.push(`# Delete secret '${secret.name}'`)
    lines.push(`delete-secret-${secret.name}:`)
    lines.push(`    podman secret rm ${secret.name}`)
    lines.push('')
  }

  const createDeps = secrets.map(s => `create-secret-${s.name}`).join(' ')
  lines.push(`# Create all secrets`)
  lines.push(`create-secrets: ${createDeps}`)
  lines.push('')

  const deleteDeps = secrets.map(s => `delete-secret-${s.name}`).join(' ')
  lines.push(`# Delete all secrets`)
  lines.push(`delete-secrets: ${deleteDeps}`)
  lines.push('')

  lines.push(`# List all podman secrets`)
  lines.push(`list-secrets:`)
  lines.push(`    podman secret ls`)
  lines.push('')

  return lines.join('\n')
}
