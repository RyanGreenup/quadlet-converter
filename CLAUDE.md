# quadlet-serde

CLI tool for serializing/deserializing container orchestration formats: Quadlet unit files (INI-style) and Docker Compose YAML.

## Specs

- **Compose**: We target the latest rolling [Compose Specification](https://www.compose-spec.io/) only. The `version` field is deprecated and ignored. We do not support legacy versioned formats (v2, v3.x).
- **Quadlet**: Podman's systemd generator format. Each `.container`, `.pod`, `.volume`, `.network` file maps 1:1 to a systemd service.

## Project structure

- `src/commands/` — CLI commands (built with Bunli)
- `src/lib/quadlet.ts` — Quadlet parser/serializer
- `src/lib/compose/` — Compose Zod schemas and parser
- `data/spec/` — Reference spec files (compose-spec.json)
- `data/examples/` — Numbered example pairs (docker-compose.yml + quadlet output)

## Commands

- `bun run dev` — run CLI
- `bun test` — run tests
- `bun run typecheck` — type check
- `just generate-examples` — regenerate quadlet examples from compose files using podlet
