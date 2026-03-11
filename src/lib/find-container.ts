/** Try multiple podman filters in order, return the first container ID found. */
export async function findContainer(service: string, project?: string): Promise<string | null> {
  const filters: string[][] = []

  if (project) {
    filters.push([
      '--filter', `label=io.podman.quadlet.service=${service}`,
      '--filter', `label=io.podman.quadlet.project=${project}`,
    ])
    filters.push([
      '--filter', `label=com.docker.compose.service=${service}`,
      '--filter', `label=com.docker.compose.project=${project}`,
    ])
  } else {
    filters.push(['--filter', `label=io.podman.quadlet.service=${service}`])
    filters.push(['--filter', `label=com.docker.compose.service=${service}`])
  }

  for (const filter of filters) {
    const proc = Bun.spawn(['podman', 'ps', '-q', ...filter], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) continue
    const stdout = (await new Response(proc.stdout).text()).trim()
    if (stdout) return stdout.split('\n')[0]
  }

  return null
}
