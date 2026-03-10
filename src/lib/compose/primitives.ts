import { z } from 'zod'

/** Either a single string or a list of strings */
export const StringOrList = z.union([z.string(), z.array(z.string())])

/** A list of unique strings */
export const ListOfStrings = z.array(z.string())

/** Either a dict of key→value or a list of "KEY=VAL" strings */
export const ListOrDict = z.union([
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.array(z.string()),
])

/** Command: null | string | string[] */
export const Command = z.union([z.null(), z.string(), z.array(z.string())])

/** Extra hosts: object mapping hostname→ip(s) or array of "host:ip" strings */
export const ExtraHosts = z.union([
  z.record(
    z.string(),
    z.union([z.string(), z.array(z.string())]),
  ),
  z.array(z.string()),
])

/** Block IO rate limit for a device */
export const BlkioLimit = z.object({
  path: z.string().optional(),
  rate: z.union([z.number().int(), z.string()]).optional(),
})

/** Block IO weight for a device */
export const BlkioWeight = z.object({
  path: z.string().optional(),
  weight: z.union([z.number().int(), z.string()]).optional(),
})

/** Service config or secret reference */
const ServiceConfigOrSecretItem = z.union([
  z.string(),
  z.looseObject({
    source: z.string().optional(),
    target: z.string().optional(),
    uid: z.string().optional(),
    gid: z.string().optional(),
    mode: z.union([z.number(), z.string()]).optional(),
  }),
])

export const ServiceConfigOrSecret = z.array(ServiceConfigOrSecretItem)

/** Ulimits: each key maps to a number/string or {soft, hard} */
const UlimitValue = z.union([
  z.union([z.number().int(), z.string()]),
  z.looseObject({
    soft: z.union([z.number().int(), z.string()]),
    hard: z.union([z.number().int(), z.string()]),
  }),
])

export const Ulimits = z.record(z.string(), UlimitValue)

/** Env file: string | array of (string | {path, format?, required?}) */
const EnvFileItem = z.union([
  z.string(),
  z.object({
    path: z.string(),
    format: z.string().optional(),
    required: z.union([z.boolean(), z.string()]).optional(),
  }),
])

export const EnvFile = z.union([z.string(), z.array(EnvFileItem)])

/** Label file: string | string[] */
export const LabelFile = z.union([z.string(), z.array(z.string())])

/** Service lifecycle hook */
export const ServiceHook = z.looseObject({
  command: Command,
  user: z.string().optional(),
  privileged: z.union([z.boolean(), z.string()]).optional(),
  working_dir: z.string().optional(),
  environment: ListOrDict.optional(),
})

/** Include entry: string | object with path, env_file, project_directory */
export const Include = z.union([
  z.string(),
  z.object({
    path: StringOrList.optional(),
    env_file: StringOrList.optional(),
    project_directory: z.string().optional(),
  }),
])

export type StringOrList = z.infer<typeof StringOrList>
export type ListOfStrings = z.infer<typeof ListOfStrings>
export type ListOrDict = z.infer<typeof ListOrDict>
export type Command = z.infer<typeof Command>
export type ExtraHosts = z.infer<typeof ExtraHosts>
export type BlkioLimit = z.infer<typeof BlkioLimit>
export type BlkioWeight = z.infer<typeof BlkioWeight>
export type ServiceConfigOrSecret = z.infer<typeof ServiceConfigOrSecret>
export type Ulimits = z.infer<typeof Ulimits>
export type EnvFile = z.infer<typeof EnvFile>
export type LabelFile = z.infer<typeof LabelFile>
export type ServiceHook = z.infer<typeof ServiceHook>
export type Include = z.infer<typeof Include>
