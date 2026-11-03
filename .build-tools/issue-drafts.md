# Issue 1 草稿(按 bug_report.yml 模板)

## Title
[Bug]: OpenCLIApp (bundled opencli 1.8.6) and global CLI (2.0.x) fight over the daemon — repeated version flips drop the extension connection

## Description

When OpenCLIApp (which bundles opencli **1.8.6**) and a globally installed CLI **2.0.x** are both present, each side replaces the other's daemon with its own version. The daemon flips between 1.8.6 and 2.0.x, and every flip drops the BrowserBridge extension connection until something reconnects.

Both sides treat a foreign-version daemon as stale and replace it:

- CLI 2.0.x (`dist/src/browser/daemon-lifecycle.js`): `ensureBrowserBridgeReady()` compares `daemonVersion !== PKG_VERSION`, SIGKILLs the stale pid, and spawns its own
- OpenCLIApp respawns its bundled 1.8.6 daemon lazily whenever the app issues an internal daemon request

Neither side checks whether the running daemon is protocol-compatible — only exact version match. So each side's next request tears down the other's daemon.

This is related to but distinct from #2690 (bind-address/::1 mismatch): that issue is about which address the daemon binds; this one is about version-based replacement racing between the app and the CLI.

## Steps to Reproduce

1. Install OpenCLIApp 0.1.38 (bundles opencli 1.8.6) and keep it running
2. Install `@jackwener/opencli` 2.0.x globally
3. Kill the current daemon (or just let one side act): the CLI's stale check SIGKILLs it and spawns a 2.0.x daemon
4. Wait for (or trigger) any OpenCLIApp-internal daemon request: the app replaces it with a 1.8.6 daemon
5. Observe `opencli daemon status` flipping `daemonVersion` between `2.0.0` and `1.8.6`, with `extensionConnected: false` after each flip

Observed on 2026-10-29 → 10-31: at least 3 version flips over two days; every flip dropped `extensionConnected` to `false` until the extension reconnected.

## Expected Behavior

The running daemon should be kept if it is protocol-compatible with the requesting side — or both sides should agree on a negotiated protocol version — instead of each side killing the other's daemon on exact-version mismatch.

## OpenCLI Version

Both `1.8.6` (bundled with OpenCLIApp 0.1.38) and `2.0.0` (global npm CLI) are involved. Extension: 1.0.26.

## Node.js Version

22.x

## Operating System

Windows

## Logs / Screenshots

```text
2026-10-29 → 10-31 daemon status samples (pid / daemonVersion):
  pid 40768  daemonVersion "2.0.0"   (CLI respawn)
  pid 58720  daemonVersion "1.8.6"   (app respawn)
  pid 18544  daemonVersion "2.0.0"   (CLI respawn after app closed)
Every flip had extensionConnected: false until manual reconnection.
```

Controlled experiment (2026-10-31): with OpenCLIApp running, killed the daemon → CLI 2.0.0 respawned within seconds; ~30s later (or on next app activity) the app replaced it with 1.8.6 again. After closing OpenCLIApp, the CLI's daemon stayed up undisturbed.

---

# Issue 2 草稿(按 bug_report.yml 模板)

## Title
[Bug] BrowserBridge extension cannot reach daemon on 127.0.0.1 when Edge proxy settings change loopback/address-family behavior

## Description

On Windows 11 + Edge, the BrowserBridge extension's service worker could not reach the daemon at `127.0.0.1:19825` — 10/10 fetch attempts from the extension timed out, while Node.js on the same machine succeeded 10/10 to the same URL. Relaunching Edge with `--no-proxy-server` immediately restored extension↔daemon connectivity.

Two candidate root causes (both verified independently, not mutually exclusive):

1. **Edge proxy stack alters loopback reachability** from the extension's network context. System proxy was disabled with `127.*` on the bypass list, and no proxy process was running — yet the extension still failed, and `--no-proxy-server` fixed it. This suggests Edge's own proxy/address handling changes behavior even when system proxy is off.
2. **`localhost` resolves to `::1` first** on this machine while the daemon binds only `127.0.0.1` (see also #2690 for the bind half). The extension used `localhost` as `DAEMON_HOST` until hardcoded to `127.0.0.1`.

Related: #2690 (daemon bind address vs CLI probe). This report covers the extension-side reachability trigger under Edge.

## Steps to Reproduce

1. Windows 11 + Edge, OpenCLI daemon running (verified via `curl http://127.0.0.1:19825/ping` from Node — 200)
2. Install BrowserBridge extension 1.0.26; from its service worker console:
   ```js
   fetch('http://127.0.0.1:19825/ping').then(r => console.log('ok', r.status)).catch(e => console.log('fail', e.message))
   ```
3. Observe: timeout/failure from the extension context while the same fetch from Node succeeds
4. Relaunch Edge with `--no-proxy-server` and retry

## Expected Behavior

The extension should reach the local daemon regardless of Edge proxy/address-family settings — loopback to `127.0.0.1` should not be routed through or affected by proxy resolution.

## OpenCLI Version

Daemon: both 1.8.6 and 2.0.0 affected. Extension: 1.0.26.

## Node.js Version

22.x

## Operating System

Windows

## Logs / Screenshots

Extension service worker probe (before fix):

```text
probe ping ×10  → ok=0 bad=10   (1.5s timeout each)
probe :18777 ×6  → ok=0 bad=6   (different local port, same failure)
Node same URLs   → all ok       (<5ms)
```

After `--no-proxy-server`: extension connects within 12s.
Workaround also verified: hardcoding `DAEMON_HOST = "127.0.0.1"` in the extension (instead of `localhost`) removes the address-family ambiguity.

---

**Background (both issues):** Found while developing a dsh plugin that drives the OpenCLI daemon ([IKEASven69/dsh-opencli](https://github.com/IKEASven69/dsh-opencli)) — happy to test fixes against real workloads.
