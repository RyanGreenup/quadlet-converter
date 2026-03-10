import { defineGroup } from '@bunli/core'
import quadletCommand from './from-json/quadlet.js'

const fromJsonGroup = defineGroup({
  name: 'from-json',
  description: 'Convert JSON to other formats',
  commands: [quadletCommand]
})

export default fromJsonGroup
