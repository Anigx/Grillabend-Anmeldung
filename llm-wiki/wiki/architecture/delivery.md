# Delivery

Status: active
Last verified: 2026-11-04
Confidence: medium

## Purpose

This page covers how the app is packaged and delivered: the production image, Compose service, TLS reverse proxy, interactive installers, and CI workflows. Runtime commands and recovery steps are in the [runbook](../operations/runbook.md); the operator handbook is [docs/handbuch/betrieb.md](../../../docs/handbuch/betrieb.md).

## What exists

### Container and Compose

- `Dockerfile` uses a digest-pinned Node 22 Debian Trixie slim image, installs production dependencies with `npm ci --omit=dev --ignore-scripts`, copies only `server.js`, `src/`, and `public/`, runs as `node`, and sets `NODE_ENV=production`, `PORT=80`, `DATA_DIR=/app/data` (`Dockerfile:1-20`).
- `compose.yaml` defines the `grillabend` service, the published image, a loopback port mapping to container port 80, and the persistent volume `grillabend-data` (`compose.yaml:1-13`).
- The image contains no tests, docs, deploy scripts, `.env`, SQLite files, or private keys (`.dockerignore:1-16`).

### Reverse proxy and TLS

- Nginx terminates TLS and forwards to the Node process. The example config redirects HTTP to HTTPS, uses a placeholder domain and certificate paths, sets anti-framing headers, and forwards the client address (`deploy/nginx.conf.example:1-28`).
- `deploy/setup-https-selfsigned.sh` creates a self-signed test certificate and a proxy for test use; it is not a production certificate workflow (`docs/handbuch/betrieb.md:88-98`).
- The app itself speaks HTTP only. It must not be directly exposed (`README.md:57`; `docs/handbuch/betrieb.md:79-86`).

### Installers

| Installer | Target | Notes |
|---|---|---|
| `install.sh` | Debian/Ubuntu, Docker | Interactive TUI; default install path `/opt/grillabend`; local binding by default; optional LAN override |
| `bootstrap.ps1` → `install.ps1` | Windows + Docker Desktop | Bootstrap downloads the full installer; Docker Desktop/WSL2 setup; LAN by default after confirmation |
| `bootstrap-native.ps1` → `install-native.ps1` | Windows without Docker | Node.js 22 + app ZIP; scheduled task under `SYSTEM`; data under `%ProgramData%`; x64/ARM64 intended |

Sources: `README.md:20-48`; `docs/handbuch/installation.md:9-61`; `docs/handbuch/betrieb.md:22-37`. The installers support update, database backup, uninstall, and purge; they do not modify `compose.yaml` (`docs/handbuch/betrieb.md:18,36-37`).

### CI and preview

- `.github/workflows/docker.yml` runs tests with `npm ci --ignore-scripts`, installs Nginx for the proxy regression, builds the image, runs `deploy/smoke-image.cjs` in a container, and publishes to GHCR only from `main`/`v*` tags (`docker.yml:14-90`).
- External Actions are pinned to full commit SHAs; the publish job has `packages: write` only (`docker.yml:11-12,50-58`).
- `.github/workflows/vm-preview.yml` builds the image on a temporary Ubuntu VM, starts it with `compose.yaml`, puts a local Nginx proxy in front, and exposes a temporary HTTPS URL through a checksum-verified `cloudflared` binary (`vm-preview.yml:20-52`; `deploy/preview-vm.sh:1-114`).
- The preview uses an ephemeral empty database and synthetic registration data; it is not a permanent host (`deploy/preview-vm.sh:89-97`).

## How it works

1. **Build:** CI runs tests, builds the image, and starts a short-lived container. The smoke test creates the app with a temporary data directory, registers a synthetic account, and checks the cookie has no `Secure` attribute (`deploy/smoke-image.cjs:1-33`).
2. **Deploy:** `docker compose pull` and `docker compose up -d` start the service; the volume keeps SQLite across image updates (`docs/handbuch/betrieb.md:100-113`).
3. **Expose:** the operator runs a local Nginx proxy on 443 and points it at the loopback-published container port (`deploy/nginx.conf.example:21-27`).
4. **Install:** the TUI scripts provision Docker or Node, fetch the app/image, set the binding, optionally create a firewall rule, and optionally schedule startup. State and logs live in installer-specific directories (`docs/handbuch/betrieb.md:26-37`).
5. **Update:** installers back up SQLite before replacing the app; Docker updates rely on the volume (`docs/handbuch/betrieb.md:36,120-124`).

## Interfaces and data

- Image environment: `NODE_ENV=production`, `PORT=80`, `DATA_DIR=/app/data`; server default host is all interfaces (`Dockerfile:14-16`; `server.js:5-6`).
- Compose: service `grillabend`, volume `grillabend-data`, loopback mapping to port 80 (`compose.yaml`).
- Installer options include bind mode, install directory, and native port; see `install.sh --help`, `install.ps1 -Help`, `install-native.ps1 -Help`.
- No application `.env` is loaded; Compose values are fixed (`docs/handbuch/betrieb.md:5-18`).

## Contradictions and superseded claims

- **Preview cookie assertion:** `deploy/preview-vm.sh:96` expects `Secure`, but the runtime and smoke test deliberately do not set it. The check cannot pass as written. See [the contradiction](../contradictions/2026-11-04-preview-cookie-check.md).
- `docs/wiki/entwicklung/lokal-starten.md:50` describes the preview as having checked cookie attributes; that claim is stale for the current HTTP-only policy.

## Risks and gotchas

- **HTTP-only boundary:** bypassing the proxy exposes credentials and cookies; keep the loopback mapping (`docs/handbuch/sicherheit.md:21-22`).
- **LAN mode is unencrypted.** The Windows Docker and native installers default to LAN after confirmation; use only in trusted networks (`docs/handbuch/betrieb.md:33-35`).
- **`docker compose down -v` deletes the data volume.** Use `down` without `-v` unless deletion is intended (`docs/handbuch/betrieb.md:113`).
- **Installer claims are partly manual.** A full Windows Docker Desktop run, WSL2 reboot, Linux update path, and ARM64 native run are not proven (`docs/wiki/planung.md:9-10`).
- **The GHCR image is linux/amd64 only.** Docker on ARM is rejected; the native Windows installer is the ARM64 path (`docs/wiki/entwicklung/lokal-starten.md:21`).

## Open questions

- Which production host, domain, certificate source, and renewal process will be used? **Confidence: low.** Source: `docs/wiki/entwicklung/lokal-starten.md:58`.
- Who owns backup/restore and how often is it tested? **Confidence: low.** Source: `docs/wiki/planung.md:5`.
- Will the VM preview workflow be fixed or retired? **Confidence: low.** It is manual and currently inconsistent.

## Related pages

- [Architecture overview](overview.md)
- [Security](security.md)
- [Runbook](../operations/runbook.md)
- [Existing German operations handbook](../../../docs/handbuch/betrieb.md)
- [Existing German installation handbook](../../../docs/handbuch/installation.md)
