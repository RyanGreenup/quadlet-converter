import { z } from 'zod'
import {
  StringOrList, ListOfStrings, ListOrDict, Command, ExtraHosts,
  BlkioLimit, BlkioWeight, ServiceConfigOrSecret, Ulimits,
  EnvFile, LabelFile, ServiceHook,
} from './primitives.js'
import { DeploySchema } from './deploy.js'

// --- Inline sub-schemas ---

const BuildConfig = z.union([
  z.string(),
  z.looseObject({
    context: z.string().optional(),
    dockerfile: z.string().optional(),
    dockerfile_inline: z.string().optional(),
    entitlements: z.array(z.string()).optional(),
    args: ListOrDict.optional(),
    ssh: ListOrDict.optional(),
    labels: ListOrDict.optional(),
    cache_from: z.array(z.string()).optional(),
    cache_to: z.array(z.string()).optional(),
    no_cache: z.union([z.boolean(), z.string()]).optional(),
    additional_contexts: ListOrDict.optional(),
    network: z.string().optional(),
    provenance: z.union([z.string(), z.boolean()]).optional(),
    sbom: z.union([z.string(), z.boolean()]).optional(),
    pull: z.union([z.boolean(), z.string()]).optional(),
    target: z.string().optional(),
    shm_size: z.union([z.number().int(), z.string()]).optional(),
    extra_hosts: ExtraHosts.optional(),
    isolation: z.string().optional(),
    privileged: z.union([z.boolean(), z.string()]).optional(),
    secrets: ServiceConfigOrSecret.optional(),
    tags: z.array(z.string()).optional(),
    ulimits: Ulimits.optional(),
    platforms: z.array(z.string()).optional(),
  }),
])

const BlkioConfig = z.object({
  device_read_bps: z.array(BlkioLimit).optional(),
  device_read_iops: z.array(BlkioLimit).optional(),
  device_write_bps: z.array(BlkioLimit).optional(),
  device_write_iops: z.array(BlkioLimit).optional(),
  weight: z.union([z.number().int(), z.string()]).optional(),
  weight_device: z.array(BlkioWeight).optional(),
})

const CredentialSpec = z.looseObject({
  config: z.string().optional(),
  file: z.string().optional(),
  registry: z.string().optional(),
})

const DependsOnCondition = z.looseObject({
  restart: z.union([z.boolean(), z.string()]).optional(),
  required: z.boolean().optional(),
  condition: z.enum(['service_started', 'service_healthy', 'service_completed_successfully']),
})

const DependsOn = z.union([
  ListOfStrings,
  z.record(z.string(), DependsOnCondition),
])

const DeviceMapping = z.union([
  z.string(),
  z.looseObject({
    source: z.string(),
    target: z.string().optional(),
    permissions: z.string().optional(),
  }),
])

const Extends = z.union([
  z.string(),
  z.object({
    service: z.string(),
    file: z.string().optional(),
  }),
])

const Gpus = z.union([
  z.literal('all'),
  z.array(z.looseObject({
    capabilities: ListOfStrings.optional(),
    count: z.union([z.string(), z.number().int()]).optional(),
    device_ids: ListOfStrings.optional(),
    driver: z.string().optional(),
    options: ListOrDict.optional(),
  })),
])

const Healthcheck = z.looseObject({
  disable: z.union([z.boolean(), z.string()]).optional(),
  interval: z.string().optional(),
  retries: z.union([z.number(), z.string()]).optional(),
  test: z.union([z.string(), z.array(z.string())]).optional(),
  timeout: z.string().optional(),
  start_period: z.string().optional(),
  start_interval: z.string().optional(),
})

const Logging = z.looseObject({
  driver: z.string().optional(),
  options: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
})

const PortConfig = z.union([
  z.number(),
  z.string(),
  z.looseObject({
    name: z.string().optional(),
    mode: z.string().optional(),
    host_ip: z.string().optional(),
    target: z.union([z.number().int(), z.string()]).optional(),
    published: z.union([z.string(), z.number().int()]).optional(),
    protocol: z.string().optional(),
    app_protocol: z.string().optional(),
  }),
])

const BindMount = z.looseObject({
  propagation: z.string().optional(),
  create_host_path: z.union([z.boolean(), z.string()]).optional(),
  recursive: z.enum(['enabled', 'disabled', 'writable', 'readonly']).optional(),
  selinux: z.enum(['z', 'Z']).optional(),
})

const VolumeOptions = z.looseObject({
  labels: ListOrDict.optional(),
  nocopy: z.union([z.boolean(), z.string()]).optional(),
  subpath: z.string().optional(),
})

const TmpfsOptions = z.looseObject({
  size: z.union([z.number().int().min(0), z.string()]).optional(),
  mode: z.union([z.number(), z.string()]).optional(),
})

const ImageMount = z.looseObject({
  subpath: z.string().optional(),
})

const VolumeMount = z.union([
  z.string(),
  z.looseObject({
    type: z.enum(['bind', 'volume', 'tmpfs', 'cluster', 'npipe', 'image']),
    source: z.string().optional(),
    target: z.string().optional(),
    read_only: z.union([z.boolean(), z.string()]).optional(),
    consistency: z.string().optional(),
    bind: BindMount.optional(),
    volume: VolumeOptions.optional(),
    tmpfs: TmpfsOptions.optional(),
    image: ImageMount.optional(),
  }),
])

const ServiceNetworkConfig = z.union([
  z.looseObject({
    aliases: ListOfStrings.optional(),
    interface_name: z.string().optional(),
    ipv4_address: z.string().optional(),
    ipv6_address: z.string().optional(),
    link_local_ips: ListOfStrings.optional(),
    mac_address: z.string().optional(),
    driver_opts: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    priority: z.number().optional(),
    gw_priority: z.number().optional(),
  }),
  z.null(),
])

const ServiceNetworks = z.union([
  ListOfStrings,
  z.record(z.string(), ServiceNetworkConfig),
])

const ServiceModels = z.union([
  ListOfStrings,
  z.record(z.string(), z.looseObject({
    endpoint_var: z.string().optional(),
    model_var: z.string().optional(),
  })),
])

const ProviderOptions = z.union([
  z.union([z.string(), z.number(), z.boolean()]),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
])

const Provider = z.looseObject({
  type: z.string(),
  options: z.record(z.string(), ProviderOptions).optional(),
})

const WatchAction = z.enum(['rebuild', 'sync', 'restart', 'sync+restart', 'sync+exec'])

const WatchItem = z.looseObject({
  ignore: StringOrList.optional(),
  include: StringOrList.optional(),
  path: z.string(),
  action: WatchAction,
  target: z.string().optional(),
  exec: ServiceHook.optional(),
  initial_sync: z.boolean().optional(),
})

const Development = z.union([
  z.looseObject({
    watch: z.array(WatchItem).optional(),
  }),
  z.null(),
])

// --- Main service schema ---

export const ServiceSchema = z.looseObject({
  develop: Development.optional(),
  deploy: DeploySchema.optional(),
  annotations: ListOrDict.optional(),
  attach: z.union([z.boolean(), z.string()]).optional(),
  build: BuildConfig.optional(),
  blkio_config: BlkioConfig.optional(),
  cap_add: z.array(z.string()).optional(),
  cap_drop: z.array(z.string()).optional(),
  cgroup: z.enum(['host', 'private']).optional(),
  cgroup_parent: z.string().optional(),
  command: Command.optional(),
  configs: ServiceConfigOrSecret.optional(),
  container_name: z.string().optional(),
  cpu_count: z.union([z.string(), z.number().int().min(0)]).optional(),
  cpu_percent: z.union([z.string(), z.number().int().min(0).max(100)]).optional(),
  cpu_shares: z.union([z.number(), z.string()]).optional(),
  cpu_quota: z.union([z.number(), z.string()]).optional(),
  cpu_period: z.union([z.number(), z.string()]).optional(),
  cpu_rt_period: z.union([z.number(), z.string()]).optional(),
  cpu_rt_runtime: z.union([z.number(), z.string()]).optional(),
  cpus: z.union([z.number(), z.string()]).optional(),
  cpuset: z.string().optional(),
  credential_spec: CredentialSpec.optional(),
  depends_on: DependsOn.optional(),
  device_cgroup_rules: ListOfStrings.optional(),
  devices: z.array(DeviceMapping).optional(),
  dns: StringOrList.optional(),
  dns_opt: z.array(z.string()).optional(),
  dns_search: StringOrList.optional(),
  domainname: z.string().optional(),
  entrypoint: Command.optional(),
  env_file: EnvFile.optional(),
  label_file: LabelFile.optional(),
  environment: ListOrDict.optional(),
  expose: z.array(z.union([z.string(), z.number()])).optional(),
  extends: Extends.optional(),
  provider: Provider.optional(),
  external_links: z.array(z.string()).optional(),
  extra_hosts: ExtraHosts.optional(),
  gpus: Gpus.optional(),
  group_add: z.array(z.union([z.string(), z.number()])).optional(),
  healthcheck: Healthcheck.optional(),
  hostname: z.string().optional(),
  image: z.string().optional(),
  init: z.union([z.boolean(), z.string()]).optional(),
  ipc: z.string().optional(),
  isolation: z.string().optional(),
  labels: ListOrDict.optional(),
  links: z.array(z.string()).optional(),
  logging: Logging.optional(),
  mac_address: z.string().optional(),
  mem_limit: z.union([z.number(), z.string()]).optional(),
  mem_reservation: z.union([z.string(), z.number().int()]).optional(),
  mem_swappiness: z.union([z.number().int(), z.string()]).optional(),
  memswap_limit: z.union([z.number(), z.string()]).optional(),
  network_mode: z.string().optional(),
  models: ServiceModels.optional(),
  networks: ServiceNetworks.optional(),
  oom_kill_disable: z.union([z.boolean(), z.string()]).optional(),
  oom_score_adj: z.union([z.string(), z.number().int().min(-1000).max(1000)]).optional(),
  pid: z.union([z.string(), z.null()]).optional(),
  pids_limit: z.union([z.number(), z.string()]).optional(),
  platform: z.string().optional(),
  ports: z.array(PortConfig).optional(),
  post_start: z.array(ServiceHook).optional(),
  pre_stop: z.array(ServiceHook).optional(),
  privileged: z.union([z.boolean(), z.string()]).optional(),
  profiles: ListOfStrings.optional(),
  pull_policy: z.string().optional(),
  pull_refresh_after: z.string().optional(),
  read_only: z.union([z.boolean(), z.string()]).optional(),
  restart: z.string().optional(),
  runtime: z.string().optional(),
  scale: z.union([z.number().int(), z.string()]).optional(),
  security_opt: z.array(z.string()).optional(),
  shm_size: z.union([z.number(), z.string()]).optional(),
  secrets: ServiceConfigOrSecret.optional(),
  sysctls: ListOrDict.optional(),
  stdin_open: z.union([z.boolean(), z.string()]).optional(),
  stop_grace_period: z.string().optional(),
  stop_signal: z.string().optional(),
  storage_opt: z.record(z.string(), z.unknown()).optional(),
  tmpfs: StringOrList.optional(),
  tty: z.union([z.boolean(), z.string()]).optional(),
  ulimits: Ulimits.optional(),
  use_api_socket: z.boolean().optional(),
  user: z.string().optional(),
  uts: z.string().optional(),
  userns_mode: z.string().optional(),
  volumes: z.array(VolumeMount).optional(),
  volumes_from: z.array(z.string()).optional(),
  working_dir: z.string().optional(),
})

export type Service = z.infer<typeof ServiceSchema>
