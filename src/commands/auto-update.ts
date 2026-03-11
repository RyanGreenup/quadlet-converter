import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'

const autoUpdateCommand = defineCommand({
  name: 'auto-update',
  description: 'Enable the podman auto-update timer',
  options: {
    system: option(
      z.boolean().default(false),
      { description: 'Enable system-wide instead of per-user' },
    ),
    'dry-run': option(
      z.boolean().default(false),
      { description: 'Check for available updates without applying them' },
    ),
  },
  handler: async ({ flags }) => {
    const scope = flags.system ? [] : ['--user']

    if (flags['dry-run']) {
      const args = ['podman', 'auto-update', '--dry-run']
      console.log(`$ ${args.join(' ')}`)
      const proc = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' })
      process.exit(await proc.exited)
    }

    // Enable the timer
    const enableArgs = ['systemctl', ...scope, 'enable', '--now', 'podman-auto-update.timer']
    console.log(`$ ${enableArgs.join(' ')}`)
    const enableProc = Bun.spawn(enableArgs, { stdout: 'inherit', stderr: 'inherit' })
    const enableCode = await enableProc.exited
    if (enableCode !== 0) {
      console.error('Failed to enable podman-auto-update.timer')
      process.exit(enableCode)
    }

    // Show timer status
    console.log()
    const statusArgs = ['systemctl', ...scope, 'list-timers', 'podman-auto-update.timer']
    console.log(`$ ${statusArgs.join(' ')}`)
    const statusProc = Bun.spawn(statusArgs, { stdout: 'inherit', stderr: 'inherit' })
    await statusProc.exited

    console.log('\nAuto-update enabled. Podman will check for newer images daily.')
    console.log('To check for updates without applying: panlet auto-update --dry-run')
    console.log('To view update history: journalctl' + (flags.system ? '' : ' --user') + ' -u podman-auto-update.service')
  },
})

export default autoUpdateCommand
