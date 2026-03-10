import { defineCommand } from '@bunli/core'
import { parseCompose } from '../lib/compose/index.js'

/** Inspect a container image and return the User field, or null if unavailable. */
async function getImageUser(image: string): Promise<string | null> {
  const proc = Bun.spawn(['podman', 'image', 'inspect', '--format', '{{.Config.User}}', image], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    // Image not available locally, try skopeo for remote inspection
    const skopeo = Bun.spawn(['skopeo', 'inspect', `docker://${image}`], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const skopeoExit = await skopeo.exited
    if (skopeoExit !== 0) return null
    const json = JSON.parse(await new Response(skopeo.stdout).text())
    return json.User ?? null
  }
  const user = (await new Response(proc.stdout).text()).trim()
  return user || null
}

function isRoot(user: string | null): boolean {
  if (user == null || user === '') return true
  if (user === '0' || user === 'root') return true
  if (user.startsWith('0:') || user.startsWith('root:')) return true
  return false
}

const checkCommand = defineCommand({
  name: 'check',
  description: 'Check a compose file for potential issues',
  handler: async ({ positional }) => {
    const filePath = positional[0]
    if (!filePath) {
      console.error('Error: please provide a compose file path')
      process.exit(1)
    }

    const file = Bun.file(filePath)
    const text = await file.text()
    const compose = parseCompose(text)

    if (!compose.services || Object.keys(compose.services).length === 0) {
      console.error('Error: no services found in compose file')
      process.exit(1)
    }

    let warnings = 0

    for (const [name, service] of Object.entries(compose.services)) {
      if (service.user) {
        if (isRoot(service.user)) {
          console.warn(`⚠ ${name}: user is explicitly set to root ("${service.user}")`)
          warnings++
        }
        continue
      }

      if (!service.image) {
        console.warn(`⚠ ${name}: no image specified, cannot check user`)
        warnings++
        continue
      }

      const imageUser = await getImageUser(service.image)
      if (isRoot(imageUser)) {
        console.warn(`⚠ ${name}: image "${service.image}" runs as root${imageUser ? ` (User="${imageUser}")` : ' (no USER set)'}`)
        warnings++
      } else {
        console.log(`✓ ${name}: image "${service.image}" runs as non-root (User="${imageUser}")`)
      }
    }

    if (warnings > 0) {
      console.log(`\n${warnings} warning(s). Consider adding "user:" to your compose services or "User=" to your quadlet files.`)
      process.exit(1)
    } else {
      console.log('\nAll services run as non-root.')
    }
  }
})

export default checkCommand
