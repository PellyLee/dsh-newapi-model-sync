# Changelog

## 1.0.0 — 2026-10-06

Initial public release.

- Host + Client halves; settings section with master switch, base URL, API key (masked secret),
  provider route name, interval, exclude patterns, and a *Sync now* button.
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
