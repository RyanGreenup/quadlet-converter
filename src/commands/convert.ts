import { defineGroup } from '@bunli/core'
import composeToQuadletCommand from './convert/compose-to-quadlet.js'
import quadletToComposeCommand from './convert/quadlet-to-compose.js'

const convertGroup = defineGroup({
  name: 'convert',
  description: 'Convert between Compose and Quadlet formats',
  commands: [composeToQuadletCommand, quadletToComposeCommand]
})

export default convertGroup
