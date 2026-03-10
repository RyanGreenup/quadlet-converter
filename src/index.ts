#!/usr/bin/env bun
import { createCLI } from '@bunli/core'
import helloCommand from './commands/hello.js'
import toJsonCommand from './commands/to-json.js'

const cli = await createCLI({
  name: 'quadlet-serde',
  version: '0.1.0',
  description: 'A CLI built with Bunli'
})

cli.command(helloCommand)
cli.command(toJsonCommand)

await cli.run()