#!/usr/bin/env bun
import { createCLI } from '@bunli/core'
import helloCommand from './commands/hello.js'
import toJsonCommand from './commands/to-json.js'
import fromJsonCommand from './commands/from-json.js'
import toIrCommand from './commands/to-ir.js'
import convertCommand from './commands/convert.js'
import runCommand from './commands/run.js'
import checkCommand from './commands/check.js'

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

await cli.run()