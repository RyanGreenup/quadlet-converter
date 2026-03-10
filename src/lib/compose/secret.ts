import { z } from 'zod'
import { ListOrDict } from './primitives.js'

export const SecretSchema = z.looseObject({
  name: z.string().optional(),
  environment: z.string().optional(),
  file: z.string().optional(),
  external: z.union([z.boolean(), z.string(), z.object({ name: z.string().optional() })]).optional(),
  labels: ListOrDict.optional(),
  driver: z.string().optional(),
  driver_opts: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  template_driver: z.string().optional(),
})

export type Secret = z.infer<typeof SecretSchema>
