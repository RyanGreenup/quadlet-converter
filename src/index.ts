#!/usr/bin/env bun
import { createCLI } from '@bunli/core'
import helloCommand from './commands/hello.js'
import toJsonCommand from './commands/to-json.js'
import fromJsonCommand from './commands/from-json.js'
import toIrCommand from './commands/to-ir.js'
import convertCommand from './commands/convert.js'
import runCommand from './commands/run.js'
import checkCommand from './commands/check.js'
import tuiCommand from './commands/tui.js'
import psCommand from './commands/ps.js'
import findCommand from './commands/find.js'
import execCommand from './commands/exec.js'
import volumePathCommand from './commands/volume-path.js'
import deployCommand from './commands/deploy.js'
import undeployCommand from './commands/undeploy.js'
import logCommand from './commands/log.js'
import generateGitHubActionsCommand from './commands/generate-github-actions.js'

const cli = await createCLI({
  name: 'quadlet-serde',
  version: '0.1.0',
  description: 'A CLI built with Bunli'
})

cli.command(helloCommand)
cli.command(toJsonCommand)
cli.command(fromJsonCommand)
cli.command(toIrCommand)
cli.command(convertCommand)
cli.command(runCommand)
cli.command(checkCommand)
cli.command(tuiCommand)
cli.command(psCommand)
cli.command(findCommand)
cli.command(execCommand)
cli.command(volumePathCommand)
cli.command(deployCommand)
cli.command(undeployCommand)
cli.command(logCommand)
cli.command(generateGitHubActionsCommand)

await cli.run()