export { ComposeFileSchema, type ComposeFile } from './compose.js'
export { ServiceSchema, type Service } from './service.js'
export { NetworkSchema, type Network } from './network.js'
export { VolumeSchema, type Volume } from './volume.js'
export { SecretSchema, type Secret } from './secret.js'
export { ConfigSchema, type Config } from './config.js'
export { ModelSchema, type Model } from './model.js'
export { DeploySchema, type Deploy } from './deploy.js'
export {
  StringOrList, ListOfStrings, ListOrDict, Command, ExtraHosts,
  BlkioLimit, BlkioWeight, ServiceConfigOrSecret, Ulimits,
  EnvFile, LabelFile, ServiceHook, Include,
} from './primitives.js'

import { ComposeFileSchema, type ComposeFile } from './compose.js'

/** Parse YAML text into a validated ComposeFile. Throws on invalid input. */
export function parseCompose(text: string): ComposeFile {
  const raw = Bun.YAML.parse(text)
  return ComposeFileSchema.parse(raw ?? {})
}

/** Parse YAML text into a ComposeFile without throwing. */
export function safeParseCompose(text: string) {
  const raw = Bun.YAML.parse(text)
  return ComposeFileSchema.safeParse(raw ?? {})
}
