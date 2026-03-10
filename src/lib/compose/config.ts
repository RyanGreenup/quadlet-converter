import { z } from 'zod'
import { ListOrDict } from './primitives.js'

export const ConfigSchema = z.looseObject({
  name: z.string().optional(),
  content: z.string().optional(),
  environment: z.string().optional(),
  file: z.string().optional(),
  external: z.union([z.boolean(), z.string(), z.object({ name: z.string().optional() })]).optional(),
  labels: ListOrDict.optional(),
  template_driver: z.string().optional(),
})

export type Config = z.infer<typeof ConfigSchema>
