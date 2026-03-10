import { defineGroup } from '@bunli/core'
import quadletCommand from './to-json/quadlet.js'
import composeCommand from './to-json/compose.js'

const toJsonGroup = defineGroup({
  name: 'to-json',
  description: 'Convert files to JSON',
  commands: [quadletCommand, composeCommand]
})

export default toJsonGroup
