# Podman Auto-Update

Podman can automatically pull newer images and restart containers, with rollback on failure.

## How it works

1. `podman auto-update` scans all running containers with the `AutoUpdate=registry` policy
2. For each, it checks the registry to see if the digest for the tag has changed
3. If a newer image exists, it pulls it and restarts the systemd unit
4. If the new container fails to start (see [Rollback](#rollback)), podman rolls back to the previous image

## Setup

### 1. Add `AutoUpdate=registry` to your Quadlet `.container` file

```ini
[Container]
Image=ghcr.io/myorg/myapp:latest
AutoUpdate=registry
```

The `registry` policy checks the remote registry for a newer digest behind the same tag. The image **must** be fully-qualified (e.g., `ghcr.io/myorg/myapp:latest`, not just `myapp:latest`).

There is also a `local` policy that compares against the local image storage instead of a remote registry — useful when you push images to the host directly.

### 2. Run under systemd

Auto-update only works with containers managed by systemd. Quadlet gives you this automatically — each `.container` file becomes a systemd service.

### 3. Enable the timer

```sh
# User-level (rootless)
systemctl --user enable --now podman-auto-update.timer

# System-level (root)
sudo systemctl enable --now podman-auto-update.timer
```

The default schedule is daily at midnight. Customize by overriding the timer:

```sh
systemctl --user edit podman-auto-update.timer
```

```ini
[Timer]
OnCalendar=
OnCalendar=*-*-* 04:00:00
```

## Rollback

Rollback is enabled by default (`--rollback=true`). When a restarted container fails, podman reverts to the previous image and restarts again.

Failure detection depends on how the container reports readiness to systemd. There are three modes, configured via the `Notify=` key in Quadlet:

| `Notify=`   | Behavior | Rollback triggers on |
|-------------|----------|---------------------|
| *(default)* | systemd considers the service started as soon as the container runtime starts the process | container process exits non-zero |
| `true`      | Container app calls `sd_notify("READY=1")` to signal readiness | app never sends READY (timeout) or exits |
| `healthy`   | Podman waits for the healthcheck to pass, then sends READY automatically | healthcheck fails or container exits |

For most containers, `Notify=healthy` combined with a healthcheck gives the best rollback behavior — no app changes needed:

```ini
[Container]
Image=ghcr.io/myorg/myapp:latest
AutoUpdate=registry
Notify=healthy
HealthCmd=curl -f http://localhost:8080/health
HealthInterval=10s
HealthRetries=3
HealthStartPeriod=30s
```

If the new image's healthcheck fails, podman rolls back to the previous image automatically.

## Useful commands

```sh
# Check what would be updated (no changes made)
podman auto-update --dry-run

# Run an update manually
podman auto-update

# Check timer status
systemctl --user status podman-auto-update.timer

# See when the next auto-update will run
systemctl --user list-timers podman-auto-update.timer

# View update history
journalctl --user -u podman-auto-update.service
```

## Authentication

If your registry requires authentication, log in first:

```sh
podman login ghcr.io
```

Podman stores credentials at `${XDG_RUNTIME_DIR}/containers/auth.json` and auto-update uses them automatically.

You can also set a per-container auth file via the label:

```ini
[Container]
Label=io.containers.autoupdate.authfile=/path/to/auth.json
```

## Workflow example

With GHCR + GitHub Actions + Quadlet:

1. CI builds and pushes `ghcr.io/myorg/myapp:latest` on merge to main
2. The Quadlet on the server references that image with `AutoUpdate=registry`
3. The timer fires, detects the new digest, pulls the image, and restarts the service
4. If the healthcheck fails, it rolls back

After initial deploy, image updates require no SSH or manual intervention. Quadlet file changes (ports, env vars, volumes) still need to be deployed separately.
