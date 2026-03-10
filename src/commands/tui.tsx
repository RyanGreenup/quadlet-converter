import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import { App } from '../tui/App.js'

export default defineCommand({
  name: 'tui',
  description: 'Interactive file browser with live conversion preview',
  tui: { renderer: { bufferMode: 'alternate' } },
  options: {
    dir: option(z.string().default('.'), { description: 'Directory to browse', short: 'd' }),
  },
  render: ({ flags }) => <App dir={flags.dir} />,
})
