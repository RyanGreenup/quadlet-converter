import { z } from 'zod'
import { ListOrDict } from './primitives.js'

const IpamConfig = z.looseObject({
  subnet: z.string().optional(),
  ip_range: z.string().optional(),
  gateway: z.string().optional(),
  aux_addresses: z.record(z.string(), z.string()).optional(),
})

const Ipam = z.looseObject({
  driver: z.string().optional(),
  config: z.array(IpamConfig).optional(),
  options: z.record(z.string(), z.string()).optional(),
})

export const NetworkSchema = z.union([
  z.looseObject({
    name: z.string().optional(),
    driver: z.string().optional(),
    driver_opts: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    ipam: Ipam.optional(),
    external: z.union([z.boolean(), z.string(), z.looseObject({ name: z.string().optional() })]).optional(),
    internal: z.union([z.boolean(), z.string()]).optional(),
    enable_ipv4: z.union([z.boolean(), z.string()]).optional(),
    enable_ipv6: z.union([z.boolean(), z.string()]).optional(),
    attachable: z.union([z.boolean(), z.string()]).optional(),
    labels: ListOrDict.optional(),
  }),
  z.null(),
])

export type Network = z.infer<typeof NetworkSchema>
