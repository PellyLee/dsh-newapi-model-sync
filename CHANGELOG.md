# Changelog

## 1.1.0 — 2026-10-07

The settings card became a real configuration form.

- **Edit every option in the browser**: enable/disable, base URL, key, provider route, interval,
  exclusion rules, debug-log path — staged locally, validated before writing, and saved as **one
  atomic mutation** through `ctx.configForms`, so a half-filled form cannot leave the plugin halfway
  between two states. Per-field *Overridden* marker and *Reset to default*; *Discard* drops every
  staged edit.
- The page now reads values from the harness-wide **describe mirror** (`ctx.configForms.get(entryId)`)
  instead of calling `ctx.remote.settings.describe()` itself, so it shares one snapshot with every
  other settings surface, follows `writable` and `memory` mode (read-only states are explained rather
  than silently inert), and its writes carry the revision fence, ordering and recovery read the
  settings domain already implements.
- **The API key no longer crosses the wire.** It is declared `role('secret')`, so the harness strips
  it from every settings read and reports only `secrets: [{ path, set }]`; the form renders it as a
  write-only field (blank = keep, *Clear key* = unset). 1.0.x never displayed it, but a `sk-` literal
  would have been readable in the browser if it had been.
- `app-boot/config-reload` is emitted after a host-side write, so the browser re-reads immediately:
  the page shows a finished sync without waiting for its poll, and the **Models page picks up a
  rewritten model list** on its own.
- *Sync now* keeps a bounded (2 s, 120 s cap) refresh as a fallback for a deployment where nothing is
  listening for that event, and a failed write is reported instead of swallowed.
- `npm test`: two headless suites, no browser and no harness process required.
  `test/client-render.mjs` evaluates the client bundle against a minimal React and a fake context and
  asserts the rendered page plus the exact operations each control writes (28 checks);
  `test/host-config.mjs` imports the real `Config` and fails on drift between the halves, a lost
  `volatile`, a lost `role('secret')`, or an exclusion pattern that no longer compiles (7 checks).
- README: the *Configure* section describes the form (both languages), the secret-handling and
  read-only/memory states are documented, a Chinese 排错 section was added to match the English one,
  and the development notes record how `ctx.configForms`, `role('secret')` redaction and
  `app-boot/config-reload` behave in this harness version.
- Corrected two claims from 1.0.1 that were wrong: `.hidden()` has **no consumer** in
  `0.2.0-rc.2` (it documents intent; the real protection is that this plugin registers its own page),
  and the `apiKey` literal was never masked *in the browser* — it is plain text in the patch file on
  disk, which is why that file should stay `chmod 600`.

Upgrading from 1.0.x: **reload the web page** (the client half is served from the bundle) **and
restart the Host** — the `Config` shape did not change, but the host half is not hot-reloaded by
default (`hmr.root: []`), so the new invalidation emit only takes effect after a restart. Without it
the page still works; a finished sync just appears after the fallback refresh instead of instantly.

## 1.0.1 — 2026-10-07

Fix the settings card, which failed to load at all in 1.0.0.

- **Client half now declares `remote.settings`** in `inject`, next to `remote`. Each generated
  remote namespace is its own service key, so reading `ctx.remote.settings` without the declaration
  threw `cannot get property "remote.settings" without inject` and the card only showed
  `读取设置失败 / Could not read settings`.
- **Consume the real `describe()` payload.** It answers `{ writable, hasDocument, namespaces: [] }`
  keyed by Loader entry id; 1.0.0 treated `value` as that array directly, which would have thrown
  `... .find is not a function` right after the inject fix.
- **Status fields are now `volatile().hidden()`** (`lastSyncAt`, `lastSyncSummary`, `lastSyncError`).
  `dsh-settings` projects a Config through `volatileForm` before answering `describe()`, so
  non-volatile fields never reach the browser: the card could not show the last sync and the
  *Sync now* poll would always hit its 90 s timeout. Hidden keeps them out of generated forms.
  Side effect: a status write-back is no longer a non-volatile config change, so it stops remounting
  the plugin.
- Re-arm the interval only when `enabled` / `intervalMinutes` actually changed: the now-volatile
  status write-back also emits `loader/volatile-update`, and re-arming on it would restart the
  countdown after every sync.
- New diagnostic when this plugin's namespace is absent (e.g. the entry id was renamed).
- README: the settings **card** shows status and triggers a sync; the harness renders no form for a
  third-party plugin's Config, so options are edited in the profile patch (examples added, both
  languages). Corrected the secret-storage note, the restart requirements, and the development
  notes now record the four harness behaviours above.

A 1.0.0 → 1.0.1 upgrade needs a page reload (client) **and a Host restart** (`Config` changed).

## 1.0.0 — 2026-10-06

Initial public release.

- Host + Client halves; settings section card with a *Sync now* button. (The card did not actually
  load — see 1.0.1.)
- Two-way sync of `providers.<providerName>.models` in the `llm-pi-ai` route, with per-model custom
  field preservation by id.
- Default exclusion patterns that keep chat models and filter out `@cf/*` embeddings, rerankers,
  speech, image, translation and moderation models.
- Three triggers: boot sync (20 s after activation, 2-minute guard), interval timer, manual
  (`/newapi-sync` or the settings button).
- Safety valves: HTTP/parse failure, empty upstream list, or a fully filtered list all skip the
  write instead of clobbering the existing configuration.
- All configuration writes run outside the Loader's activation HMR transaction via
  `ctx.hmr.executing.exit`, avoiding `HMR transactions cannot be nested`.
