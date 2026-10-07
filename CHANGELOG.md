# Changelog

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
