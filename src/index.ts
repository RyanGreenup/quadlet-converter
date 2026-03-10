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

// Temporarily change cwd so bunli doesn't try to load bunli.config.ts
// (compiled binaries can't dynamically import .ts files)
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const origCwd = process.cwd()
const tempDir = mkdtempSync(join(tmpdir(), 'panlet-'))
process.chdir(tempDir)
const cli = await createCLI({
  name: 'quadlet-serde',
  version: '0.1.0',
  description: 'A CLI built with Bunli'
})
process.chdir(origCwd)
rmSync(tempDir, { recursive: true })

cli.command(helloCommand)
cli.command(toJsonCommand)
cli.command(fromJsonCommand)
cli.command(toIrCommand)
cli.command(convertCommand)
cli.command(runCommand)
cli.command(checkCommand)
cli.command(tuiCommand)

await cli.run()