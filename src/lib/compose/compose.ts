import { z } from 'zod'
import { Include } from './primitives.js'
import { ServiceSchema } from './service.js'
import { NetworkSchema } from './network.js'
import { VolumeSchema } from './volume.js'
import { SecretSchema } from './secret.js'
import { ConfigSchema } from './config.js'
import { ModelSchema } from './model.js'

export const ComposeFileSchema = z.looseObject({
  version: z.string().optional(),
  name: z.string().optional(),
  include: z.array(Include).optional(),
  services: z.record(z.string(), ServiceSchema).optional(),
  models: z.record(z.string(), ModelSchema).optional(),
  networks: z.record(z.string(), NetworkSchema).optional(),
  volumes: z.record(z.string(), VolumeSchema).optional(),
  secrets: z.record(z.string(), SecretSchema).optional(),
  configs: z.record(z.string(), ConfigSchema).optional(),
})

export type ComposeFile = z.infer<typeof ComposeFileSchema>
