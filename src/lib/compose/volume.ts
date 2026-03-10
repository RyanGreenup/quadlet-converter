import { z } from 'zod'
import { ListOrDict } from './primitives.js'

export const VolumeSchema = z.union([
  z.looseObject({
    name: z.string().optional(),
    driver: z.string().optional(),
    driver_opts: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    external: z.union([z.boolean(), z.string(), z.looseObject({ name: z.string().optional() })]).optional(),
    labels: ListOrDict.optional(),
  }),
  z.null(),
])

export type Volume = z.infer<typeof VolumeSchema>
