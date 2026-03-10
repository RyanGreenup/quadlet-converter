import { defineGroup } from '@bunli/core'
import quadletCommand from './to-ir/quadlet.js'

const toIrGroup = defineGroup({
  name: 'to-ir',
  description: 'Convert JSON to intermediate representation',
  commands: [quadletCommand]
})

export default toIrGroup
