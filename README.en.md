# dsh-opencli

[![awesome-dsh-plugin](https://img.shields.io/badge/awesome--dsh--plugin-listed-17695?logo=github&labelColor=555)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/tree/main/data/plugins/IKEASven69__dsh-opencli.yml)
[![dsh-plugin](https://img.shields.io/badge/GitHub%20topic-dsh--plugin-4D6BFE?style=flat-square)](https://github.com/topics/dsh-plugin)
[![npm](https://img.shields.io/npm/v/@cold777/dsh-opencli?label=npm&color=CB3837)](https://www.npmjs.com/package/@cold777/dsh-opencli)

English | [简体中文](README.zh.md)

**A dsh plugin: a logged-in-browser data engine.** Drives your everyday browser (Chrome/Edge) through the [OpenCLI](https://github.com/jackwener/OpenCLI) daemon + BrowserBridge extension, providing one-step structured commands for 170 sites, logged-in web primitives, scheduled collection, execution-authenticity verification, push notifications, and replayable run history. dsh's built-in web tools target anonymous retrieval; this plugin covers the account-side half — all data comes from sessions you are already logged into, and all write operations pass a human approval gate.

- For users: installation and panel walkthrough in [Getting Started](#getting-started); full capability list in [Feature Matrix](#feature-matrix)
- For agents: SKILL.md ships with the package for in-session discovery; CLI entry point is `dsh-opencli-ctl`
- For contributors: design docs, research, and acceptance records under [docs/](docs/)

## How It Works

```
dsh agent ─┬─ tool calls (site / opencli_* / canvas_*) ──┐
dsh panel ─┼─ panel RPC (schedules / notify / canvas / audit) ───┤
any shell ─┴─ dsh-opencli-ctl (inbox intents) ───────────┤
                                                         ▼
                          dsh-opencli plugin (approval gate · authenticity · snapshots · traces)
                                                         │
                                  OpenCLI daemon + BrowserBridge extension
                                                         │
                                              your real browser (logged-in)
```

Every execution path converges on one plugin service: write operations pass an approval gate (fail-closed), collected results pass authenticity verification (exit 0 does not mean valid data), and every run leaves snapshots and traces for replay.

> The npm package is **@cold777/dsh-opencli** — the unscoped name `dsh-opencli` is taken by an unrelated low-level tool. Watch out when searching: this plugin is the full product of 170+ structured site commands, scheduled watch + change alerting, and approval gates. Install commands in this README are canonical.

## Choosing between browser plugins

Browser automation plugins in the dsh ecosystem follow two technical routes; pick by scenario, they do not conflict:

- **CDP-attach plugins** (connect to a debug port of an already-running browser): good for scripted page control — light and fast, but no site semantic layer and no unattended product layer.
- **This plugin (daemon + BrowserBridge extension)**: rides your everyday browser's logged-in sessions; the value sits above the semantic layer as a product loop — 170+ one-step site commands, approval-gated writes, action-evidence verification, scheduled collection + change alerting + multi-channel push, snapshot diff, provenance reports and run replay. Built for "let agents and schedules continuously work through your own accounts".

The two can coexist: port-based control plugins drive pages; this plugin owns the data product and approval chain.

## Quick start

```sh
# ① OpenCLI runtime (skip if already installed)
npm i -g @jackwener/opencli && opencli daemon restart

# ② BrowserBridge extension: https://github.com/jackwener/OpenCLI/releases
#    Download opencli-extension-*.zip, load unpacked in your browser, log in to your usual sites

# ③ This plugin
npm i -g @cold777/dsh-opencli          # npm (includes dsh-opencli-ctl CLI)
# or
dsh plugin add IKEASven69/dsh-opencli   # GitHub tarball
```

Restart dsh, then open **Settings → Browser Agent**: five tabs: Overview / Commands / Automation / Security / Canvas.

## Core Capabilities

### Scheduled Collection → Push

Persistent cron tasks run real collection through your logged-in browser: failures retry ×3 automatically, successes land as structured snapshots (50 kept). Watch keywords or content changes (added/removed/moved) push to Feishu/DingTalk/WeCom/Telegram with a diff summary against the previous run.

### Execution Authenticity

`exit 0` does not mean valid data. Two-layer verification (deterministic rules + sub-second decision model) flags empty results, anti-bot walls, and login pages as "suspected silent failure" — unattended tasks retry on failure. Every snapshot traces back to the command and time that produced it.

### Structured Site Commands

170 sites / 1,200+ commands in a precompiled catalog, distilled into systemPrompt so agents pick the right command on the first try — no trial and error. Each site ships a knowledge card (known pitfalls + failure-signature recovery table). Multi-site parallel collection via `site_batch`.

### Web Primitives & Canvas Bitmaps

For pages without adapters: logged-in primitives (open/click/fill/extract/screenshot and more); the eval family goes over a direct daemon transport for millisecond round trips. Canvas bitmap surfaces (charts/games/whiteboards) get a three-tool set: discover, read (bitmap auto-archived into the canvas view), click (write-gated).

### Run Replay

Every browser and scheduled execution lands as JSONL traces; the canvas view aggregates traces, evidence, and snapshots into a pannable, zoomable card flow — click a card to replay each step (command/screenshot/duration). Failed steps include output excerpts: no guessing why the last run failed.

### Write Approval Gate

Posting, deleting, and other write commands pop an approval prompt by default; execution requires explicit allow, with before/after screenshots archived as evidence. Unclear permission is treated as write (fail-closed). attack table of 22 rows (incl. 5 read-only controls) + 3 independent side-channels, each covered by a dedicated regression test, plus 200 reproducible fuzz iterations, invariant: **every allow ⟹ read-only intent** (see [Security Invariants](#security-invariants)).

## Feature Matrix

| Module | Capability |
|---|---|
| Site adapters | 170 sites / 1,200+ commands; `site_batch` multi-site parallel; distilled catalog injected into systemPrompt |
| Scheduled collection | Persistent cron; retry ×3; structured snapshots (50 kept) |
| Watch push | Keyword hits / content changes → Feishu/DingTalk/WeCom/Telegram/panel event stream |
| Sourced reports | Each section = command + time + snapshot path; zero model rewriting |
| Canvas replay | Traces/evidence/snapshots as a pannable, zoomable card flow with per-step replay |
| Canvas bitmap ops | discover/read/click for DOM-less bitmap surfaces; read bitmaps auto-archived into the canvas view |
| Authenticity | Deterministic rules + sub-second decision model; silent-failure flags and retries |
| Write approval | Tool-layer fail-closed gate; evidence pack (100 kept) |
| Execution traces | JSONL per execution; panel replay view |
| Smoke benchmark | Default 5-site read-only smoke; success rate / authenticity P / latency / direct-transport comparison |
| Automation modes | read-only / standard / autonomous / unrestricted |
| Site health | Upstream-issue-driven degraded-site flags; canary top-20 read-only drift checks |
| MCP Resources | Site knowledge at `opencli://sites/{site}/knowledge` (dsh 0.2+) |
| Login diagnostics/bridge | Per-site cookie-level status; one-click bridge for dsh's official Browser Use |
| Interception audit | Approval-gate records (7-day counts + details) |
| Rate limits | usagePolicy + 429/5xx backoff; authProfile scoped login |
| Bilingual panel | EN/zh toggle |

## For Agents

- **CLI agent sessions** (dsh CLI or other host CLIs): `site`, `opencli_*`, `canvas_*`, and `so_*` tools register with the plugin; SKILL.md ships in the package for discovery
- **Panel chat sessions**: dsh's preset scoping does not register plugin tools there — agents use shell to call `dsh-opencli-ctl` (ships with the npm package): `schedule add/list/run/remove`, `notify set/test`, `report build/export`, `status`; intents are executed by the plugin via the inbox, pass allowlist closed-set validation, and return JSON results
- **Example**: `dsh-opencli-ctl schedule add --site "site juejin hot" --cron "0 9 * * *" --watch "AI"`

## Installation Notes

- opencli ≤1.8.8 running `npm install` inside the plugin directory silently replaces the host link ([#2555](https://github.com/jackwener/opencli/issues/2555), fixed in 2.0) — on 1.8.x, install dependencies outside the repo
- Before upgrading dsh to 0.2, check your profile `cordis.patch.yml` for references to uninstalled bundles — 0.2 exits silently on them
- Panel chat sessions not listing plugin agent tools is dsh's preset-scoping architecture — see [docs/RESEARCH-20261030-dsh-preset-and-env.md](docs/RESEARCH-20261030-dsh-preset-and-env.md)

## Configuration

Zero-config out of the box; fine-tuning:

| Setting | Via | Default |
|---|---|---|
| opencli binary path | Env `DSH_OPENCLI_BIN` | `opencli` (global) |
| Write approval gate | Panel toggle | on |
| Automation mode | Panel four-mode selector | standard |
| Rate limits | `usagePolicy` (minDelay 750ms / concurrency 2 / burst 3 / cooldown 30s) | see left |
| Scoped login | `authProfiles` (`allowedDomains`/`storageStatePath`) | none |
## Security Invariants

The write approval gate is fail-closed: unclear permission is treated as write. attack table of 22 rows (incl. 5 read-only controls) + 3 independent side-channels, each covered by a dedicated regression test, plus 200 reproducible fuzz iterations, invariant: **every allow ⟹ read-only intent**. Sample shapes:

| Attack shape | Behavior |
|---|---|
| Prototype-chain names (`constructor`) / path forms (`../etc passwd`) / NUL truncation | Approval prompt |
| Trailing-space permission-query bypass (`"zhihu "`) | Approval prompt |
| Generic gateway `opencli_run` carrying write shapes | Approval prompt (no gateway exemption) |
| `site_batch` mixing write commands | Whole batch rejected, zero shell calls |
| benchmark / canary side-channel write commands | Built-in read-only gates |

All tool output is truncated and truncated and noise-stripped to prevent context pollution; rate limits + automatic backoff; scoped login rejects cross-domain.

## Tests & Verification

| Layer | Method |
|---|---|
| Unit/regression | vitest 450+ cases: approval invariant attack table + 200 fuzz / cron regression / direct transport / snapshot diff / export format / pre-submit gate |
| Full review suite | 22 checks on a live environment covering rendering / real execution / state reconciliation / RPC ground truth (`full-review.cjs`); results record the host dsh version |
| Full feature matrix | 26 end-to-end checks spanning session / direct transport / push / export / ctl full chain (`full-matrix.cjs`) |
| UI walkthrough | 9-scene, 26-assertion pass with real browser mouse/keyboard (`ui-walkthrough.cjs`) |
| Real-model E2E | Session-driven site commands / write rejection / NL intent mapping loop |

## Documentation

- [CHANGELOG](CHANGELOG.md) · [SKILL.md](SKILL.md) (agent handbook) · [AGENT_INSTALL.md](AGENT_INSTALL.md) (agent self-install)
- Development docs: [docs/](docs/) — design notes, research, acceptance records, internal conventions

## Scope

- Not a replacement for OpenCLIApp/daemon/extension — that is the engine layer; this plugin is the data cockpit inside dsh
- Not a replacement for dsh's built-in web_search/web_fetch — those cover anonymous retrieval; this plugin covers your logged-in data
- Not suitable for machines with no real browser

MIT License.
