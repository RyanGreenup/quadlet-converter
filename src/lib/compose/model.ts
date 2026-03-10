import { z } from 'zod'

export const ModelSchema = z.looseObject({
  name: z.string().optional(),
  model: z.string(),
  context_size: z.number().int().optional(),
  runtime_flags: z.array(z.string()).optional(),
})

export type Model = z.infer<typeof ModelSchema>
