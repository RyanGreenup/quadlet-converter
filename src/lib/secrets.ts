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
export function generateSecretsJustfile(secrets: SecretDef[], opts?: { sops?: boolean }): string {
  if (secrets.length === 0) return ''

  const lines: string[] = []

  for (const secret of secrets) {
    lines.push(`# Create secret '${secret.name}'`)
    if (secret.file) {
      lines.push(`create-secret-${secret.name}:`)
      lines.push(`    @test -f ${secret.file} || (echo "Error: secret file '${secret.file}' not found (needed for secret '${secret.name}')" >&2 && exit 1)`)
      if (opts?.sops) {
        lines.push(`    sops -d ${secret.file} | podman secret create ${secret.name} -`)
      } else {
        lines.push(`    podman secret create ${secret.name} ${secret.file}`)
      }
    } else if (secret.environment) {
      lines.push(`create-secret-${secret.name}:`)
      lines.push(`    @test -n "$${secret.environment}" || (echo "Error: environment variable '${secret.environment}' is not set (needed for secret '${secret.name}')" >&2 && exit 1)`)
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

  // Push recipe — create all secrets on a remote host via SSH
  lines.push(`# Push all secrets to a remote host`)
  lines.push(`push-secrets host:`)
  lines.push(`    #!/usr/bin/env python3`)
  lines.push(`    import os, subprocess, sys`)
  lines.push(`    from pathlib import Path`)
  lines.push(``)
  lines.push(`    host = "{{host}}"`)
  lines.push(`    fmt = "{" + "{.SecretData}" + "}"`)
  lines.push(`    errors = []`)
  lines.push(``)
  lines.push(`    def push(name, value):`)
  lines.push(`        print(f"Pushing secret '{name}' to {host}")`)
  lines.push(`        subprocess.run(["ssh", host, "podman", "secret", "create", "--replace", name, "-"], input=value, text=True, check=True)`)
  lines.push(``)
  // Emit precondition checks
  for (const secret of secrets) {
    if (secret.file) {
      lines.push(`    if not Path("${secret.file}").exists():`)
      lines.push(`        errors.append("Secret file '${secret.file}' not found (needed for secret '${secret.name}')")`)
    } else if (secret.environment) {
      lines.push(`    if "${secret.environment}" not in os.environ:`)
      lines.push(`        errors.append("Environment variable '${secret.environment}' is not set (needed for secret '${secret.name}')")`)
    }
  }
  lines.push(`    if errors:`)
  lines.push(`        for e in errors:`)
  lines.push(`            print(f"Error: {e}", file=sys.stderr)`)
  lines.push(`        sys.exit(1)`)
  lines.push(``)

  // Emit push calls
  for (const secret of secrets) {
    if (secret.file) {
      if (opts?.sops) {
        lines.push(`    # ${secret.name} (file, sops-encrypted)`)
        lines.push(`    push("${secret.name}", subprocess.run(["sops", "-d", "${secret.file}"], capture_output=True, text=True, check=True).stdout)`)
      } else {
        lines.push(`    # ${secret.name} (file)`)
        lines.push(`    push("${secret.name}", Path("${secret.file}").read_text())`)
      }
    } else if (secret.environment) {
      lines.push(`    # ${secret.name} (environment)`)
      lines.push(`    push("${secret.name}", os.environ["${secret.environment}"])`)
    } else if (secret.external) {
      lines.push(`    # ${secret.name} (external, read from local podman)`)
      lines.push(`    push("${secret.name}", subprocess.run(["podman", "secret", "inspect", "--showsecret", "--format", fmt, "${secret.name}"], capture_output=True, text=True, check=True).stdout)`)
    }
  }
  lines.push('')

  return lines.join('\n')
}
