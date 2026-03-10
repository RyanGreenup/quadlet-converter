import { z } from 'zod'
import { ListOfStrings, ListOrDict } from './primitives.js'

const GenericResource = z.looseObject({
  discrete_resource_spec: z.looseObject({
    kind: z.string().optional(),
    value: z.union([z.number(), z.string()]).optional(),
  }).optional(),
})

const DeviceReservation = z.looseObject({
  capabilities: ListOfStrings,
  count: z.union([z.string(), z.number().int()]).optional(),
  device_ids: ListOfStrings.optional(),
  driver: z.string().optional(),
  options: ListOrDict.optional(),
})

const ResourceLimits = z.looseObject({
  cpus: z.union([z.number(), z.string()]).optional(),
  memory: z.string().optional(),
  pids: z.union([z.number().int(), z.string()]).optional(),
})

const ResourceReservations = z.looseObject({
  cpus: z.union([z.number(), z.string()]).optional(),
  memory: z.string().optional(),
  generic_resources: z.array(GenericResource).optional(),
  devices: z.array(DeviceReservation).optional(),
})

const Resources = z.looseObject({
  limits: ResourceLimits.optional(),
  reservations: ResourceReservations.optional(),
})

const RestartPolicy = z.looseObject({
  condition: z.string().optional(),
  delay: z.string().optional(),
  max_attempts: z.union([z.number().int(), z.string()]).optional(),
  window: z.string().optional(),
})

const UpdateRollbackConfig = z.looseObject({
  parallelism: z.union([z.number().int(), z.string()]).optional(),
  delay: z.string().optional(),
  failure_action: z.string().optional(),
  monitor: z.string().optional(),
  max_failure_ratio: z.union([z.number(), z.string()]).optional(),
  order: z.enum(['start-first', 'stop-first']).optional(),
})

const PlacementPreference = z.looseObject({
  spread: z.string().optional(),
})

const Placement = z.looseObject({
  constraints: z.array(z.string()).optional(),
  preferences: z.array(PlacementPreference).optional(),
  max_replicas_per_node: z.union([z.number().int(), z.string()]).optional(),
})

export const DeploySchema = z.union([
  z.looseObject({
    mode: z.string().optional(),
    endpoint_mode: z.string().optional(),
    replicas: z.union([z.number().int(), z.string()]).optional(),
    labels: ListOrDict.optional(),
    rollback_config: UpdateRollbackConfig.optional(),
    update_config: UpdateRollbackConfig.optional(),
    resources: Resources.optional(),
    restart_policy: RestartPolicy.optional(),
    placement: Placement.optional(),
  }),
  z.null(),
])

export type Deploy = z.infer<typeof DeploySchema>
