# dsh-newapi-model-sync

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Mirror the model list of a [New API](https://github.com/Calcium-Ion/new-api) instance into a
DeepSeek Harness `llm-pi-ai` provider route — **two-way overwrite**: a model added upstream is
added here, a model removed upstream is removed here.

> 中文说明见下方 [中文](#中文说明)。

## Why

New API aggregates many upstream providers behind one OpenAI-compatible endpoint. Its model list
changes often, while a Harness route's `models` array is a static config you would otherwise edit
by hand. This plugin keeps that array in sync — and keeps it clean, by filtering out the
embeddings / rerankers / speech / image / translation and miscellaneous non-chat models that a
shared gateway usually also exposes (`@cf/*`, `bge-*`, `whisper`, `flux-*`, …).

## Features

- **Two-way sync** of `providers.<providerName>.models`: added, removed, unchanged.
- **Filtering** by user-editable, case-insensitive regexes (`excludePatterns`).
- **Field preservation** — a model already in the list keeps its custom fields
  (`contextWindow`, `reasoningEfforts`, …); only genuinely new ids are added as `{ id, name }`.
- **Settings page**: a real configuration form under *Settings* — enable/disable, base URL, key,
  provider route, interval, exclusion rules, and the debug-log path, each with an override marker
  and a *Reset to default* action, saved as **one atomic write**. It also shows the last sync time,
  its result, any error, the number of models currently in the route, and a **Sync now** button.
- **Slash command** `/newapi-sync`.
- **Three triggers**: boot (20 s after activation), interval timer, manual.
- **Safety valves** so a bad upstream can never wipe your config (see below).
- No runtime dependencies beyond the harness itself.

## Requirements

- DeepSeek Harness `0.1.7-rc.2`, `0.2.0-rc.1` or `0.2.0-rc.2` (developed and verified against
  `0.2.0-rc.2`).
- A New API instance reachable over HTTP(S), and an `sk-` token allowed to call `GET /v1/models`.

## Install

```bash
# from npm (once published)
dsh plugin --profile web add dsh-newapi-model-sync

# or from source
git clone https://github.com/PellyLee/dsh-newapi-model-sync.git
dsh plugin --profile web add ./dsh-newapi-model-sync

# or from any local checkout
dsh plugin --profile web add /path/to/dsh-newapi-model-sync
```

Replace `web` with your profile name if it differs. Then **reload the web page once** — the client
half is injected at page load. Host-side syncing and the interval timer work without a reload.
An upgrade that changes the `Config` schema also needs a **Host restart**: source-module watching is
off by default (`hmr.root: []`), so the running process keeps the old schema until it is restarted.

## Configure

Open **Settings → New API Sync**. Every option below is editable there: the page reads live values
from the Host, marks a field it inherited from the composition as *Overridden*, offers *Reset to
default* per field, and writes all staged edits in one atomic mutation — so a half-typed form can
never leave the plugin between two states. A save takes effect immediately (`volatile` fields; no
remount, no restart).

The same values live in the `config:` block of this plugin's entry in the **active profile patch**,
e.g. `profiles/web/cordis.patch.yml` — useful for the very first run (before you have a browser),
for versioning the whole profile, or if you prefer editing YAML:

```yaml
- id: newapi-model-sync
  name: 'dsh-newapi-model-sync'
  config:
    enabled: true
    baseUrl: https://newapi.example.com/v1
    apiKey: sk-xxxxxxxx        # used for GET /models only; plain text in this file
    providerName: newapi
    intervalMinutes: 10
```

Keep the `id` — the settings page addresses its own namespace by that entry id. Change it and the
page reports *"the Host is not serving this entry"* rather than quietly reconfiguring some other
plugin.

A hand-edited patch file is picked up without a restart only if HMR covers the profile document
(off by default, `hmr.root: []`); otherwise **restart the Host**. The settings page always shows the
values the running plugin actually sees, so it is the fastest way to confirm whether an edit landed.

Fields:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `enabled` | switch | on | Master switch; the timer and manual runs both obey it. |
| `baseUrl` | text | *(empty)* | Your New API base, e.g. `https://newapi.example.com/v1`. `/models` is appended; a value without a scheme is treated as `https://`. Nothing is fetched until this is set. |
| `apiKey` | secret | *(empty)* | `sk-` token used **only** for `GET /models`; never written into the route config. Declared `role('secret')`, so the harness **strips it from every settings read** — the browser only ever learns *whether* one is configured. That also makes the field write-only: blank means *keep*, and *Clear key* removes it. On disk it is still **plain text** in the profile patch, so keep that file owner-only (`chmod 600`). |
| `providerName` | text | `newapi` | The `llm-pi-ai` provider route to mirror into. |
| `intervalMinutes` | number (≥1) | `10` | Auto-sync period. |
| `excludePatterns` | string[] | see below | Case-insensitive regexes; a matching model id is excluded. |
| `preserveCustomFields` | switch | on | Keep per-model custom fields for ids already present. |
| `syncRequestAt` | number | `0` | **Internal trigger** written by the *Sync now* button. Do not edit by hand. |
| `debugFile` | text | *(empty)* | Optional file path; when set, every step is appended there. Clear it to stop tracing. |
| `lastSyncAt` / `lastSyncSummary` / `lastSyncError` | read-only | — | Last sync time, result summary, error. Written back by the plugin; `volatile` so the settings page can read it. They are also declared `hidden` — for intent, because no settings surface in `0.2.0-rc.2` consumes that flag; this plugin's own page simply does not offer them. |

Default exclusion patterns:

```
^@cf/  embedding  bge-  rerank  ocr  whisper  tts  deepgram  aura-  melotts
sensevoice  smart-turn  speech  audio  asr  gsr  stable-diffusion  dreamshaper
flux-  leonardo  runwayml  lyria  diffusiongemma  resnet  distilbert  ising
m2m100  indictrans  translate  hunyuan-mt  safety  guard  allam  riva
nemotron-parse  image
```

In other words: chat models are kept by default; vector / rerank / speech / image / translation /
moderation models are filtered out. Delete a regex to let that class through.

## How it works

```
GET {baseUrl}/models ──► filter by excludePatterns ──► diff against the current models list
                                                              │
                             ┌────────────────────────────────┘
                             ▼
        configEditor.edit(llm-pi-ai entry, providers.<name>.models = new list)
                             ▼
        write to profiles/<profile>/cordis.patch.yml (comments preserved) → Loader applies
                             ▼
        write lastSyncAt / lastSyncSummary / lastSyncError back to this plugin's row
```

Triggering: **boot sync** (20 s after activation), **interval** (`intervalMinutes`), **manual**
(Settings button or `/newapi-sync`). The boot sync is guarded: if the last sync is under
2 minutes old it does nothing, so the status write-back cannot cause a remount loop.

## Safety valves

- Non-2xx HTTP, timeout (30 s), or a payload that is not an OpenAI-compatible list → report the
  error and **skip this round**.
- Empty upstream list, or every model filtered out → **skip the write** and tell you to relax
  `excludePatterns`.
- The file is written only when the list actually differs; an empty existing list is taken over
  directly.
- If `agent-default-model` points at the route this plugin manages and the removed model happens to
  be the current default, the summary appends a warning.
- An invalid regex in `excludePatterns` is reported and skipped without affecting the others.

## Troubleshooting

- **Nothing syncs** → check `lastSyncError` on the settings page; the most common cause is an empty
  `baseUrl` or a rejected token.
- **`cannot get property "remote.settings" without inject`** → that client half predates 1.0.1, which
  declares `remote.settings` in `inject`. Upgrade and reload the page; restart the Host if the
  message survives the reload.
- **The settings page says the Host is not serving this entry** → the namespace it addresses is the
  Loader entry id, so either the `id` was changed in the patch or the entry is disabled. Restore
  `newapi-model-sync` and reload.
- **Every control is greyed out** → the deployment is read-only (`settings.describe` answered
  `writable: false`), or this page is not bound to a local Host (a remote, unauthenticated page keeps
  preferences process-local and never persists them).
- **Card still says "Never synced" after a sync ran** → the Host is running the pre-1.0.1 `Config`,
  where the status fields were not `volatile` and therefore never reached the browser. Restart it.
- **A model I need is missing** → it matched an exclusion regex; remove that entry from
  `excludePatterns`.
- **Step-by-step trace** → set `debugFile` to a path and reproduce.
- **Panel missing after install** → reload the web page.

## Limitations

- **This plugin owns the whole `providers.<providerName>.models` list.** Do not hand-maintain it —
  a hand-added model is overwritten on the next sync. Other route fields (`apiKeyEnv`, `baseURL`,
  `api`, …) are untouched.
- `GET /v1/models` returns ids, not capabilities. Newly added models therefore use pi-ai defaults;
  `preserveCustomFields` only preserves fields for ids that were already present.
- `syncRequestAt` and the three status fields are `volatile` (so the settings page can read and, for
  the trigger, write them) and declared `hidden` (so they are clearly not user options). Nothing in
  the `0.2.0-rc.2` settings domain reads that flag, so the practical guarantee is that this plugin
  registers its own page and simply never offers those fields. Do not edit them by hand.
- **The client half uses harness-internal shapes** (`settings.section` slot, `ctx.configForms`,
  `ctx.remote.settings.mutate`). A DSH upgrade may require corresponding changes; treat the peer
  range above as the supported range.
- **Host-side messages are Chinese only** (summaries, `/newapi-sync` description, error strings).
  The settings panel itself is localized (zh/en). Localizing the host half is a welcome
  contribution.
- Before 1.0.1 the status fields were not `volatile`, so each write-back was a non-volatile config
  change that remounted the plugin — which is what the 2-minute boot guard was bounding. They are
  `volatile` now; the guard still bounds any genuine remount burst.

## Development notes

- The settings page is built on **`ctx.configForms`** (the settings domain's public face, provided
  by `dsh-client-ui-settings`): `get(entryId)` gives a shared per-entry form whose snapshot is
  derived from one browser-wide describe mirror, and `set` / `unset` / `mutate` queue writes that
  carry the latest revision, fold the Host's answer back into the mirror and reload Host state when a
  write is refused. Prefer it over calling `ctx.remote.settings` by hand — it is the seam the
  built-in settings pages use, and it costs you one subscription instead of a polling loop.
- **A `role('secret')` field never reaches the browser.** `describe()` answers under
  `redactSecrets: true`, which strips the literal from `value`, `base` and `user` and reports only
  `secrets: [{ path, set }]`. A settings page therefore renders such a field as write-only, reads
  its configured state from that list, and writes it with a path-addressed op.
- **Host-side writes are invisible to the browser** unless something re-reads: `settings/document-updated`
  is only emitted while `dsh-settings` describes. After writing another entry's config (or its own
  status) this plugin emits `app-boot/config-reload`, the public "the config changed underneath you"
  event; `dsh-settings` re-describes, and the resulting invalidation refreshes every open settings
  page — including the Models page after a list rewrite. The card still keeps a bounded poll as a
  fallback for a deployment where nothing is listening.
- During activation the plugin runs inside the Loader's HMR transaction, where a direct
  `configEditor.edit` throws `HMR transactions cannot be nested`. All writes therefore go through
  an `exclusive()` helper that runs the callback from a clean context via
  `ctx.hmr.executing.exit(fn)`.
- **The client half must declare `remote.settings`, not just `remote`.** Each generated remote
  namespace is its own service key in the fiber's inject set, so reading `ctx.remote.settings`
  without it throws `cannot get property "remote.settings" without inject`. `configForms` must be
  declared the same way.
- **Only `volatile` fields reach the browser.** `dsh-settings` projects a Config through
  `volatileForm` before it answers, so any value the page displays or writes must be `.volatile()`;
  a non-volatile write remounts the plugin instead. `.hidden()` is declared for intent — nothing in
  `0.2.0-rc.2` consumes it, and neither does `autoGenerate`, which is why no settings surface in this
  version generates a form for a third-party plugin's Config: a page has to be registered by hand.
- `describe()` answers `{ writable, hasDocument, namespaces: [...] }`, keyed by the **Loader entry
  id**, and each row carries `value` plus a `revision` for compare-and-set writes. `mutate()` answers
  `{ ok: false, error: { code, message } }`, with `settings/conflict` on a stale revision.
- `loader/volatile-update` fires for *every* volatile write, including this plugin's own status
  write-back, so the listener re-arms the timer only when the cadence actually changed.
- `npm test` runs two headless suites that need no browser and no harness process:
  `test/client-render.mjs` evaluates the client bundle with a minimal React and a fake `ctx`, and
  asserts the rendered page and the exact ops each control writes; `test/host-config.mjs` imports
  the real `Config` and fails if a field loses `volatile`, the key loses `role('secret')`, or the
  two halves drift apart.

## Uninstall

Remove the bundle from the plugin manager (or `dsh plugin --profile web remove dsh-newapi-model-sync`).
Uninstalling does **not** touch the model list already written into `llm-pi-ai`.

## License

[MIT](./LICENSE)

---

## 中文说明

把 [New API](https://github.com/Calcium-Ion/new-api) 实例的模型列表**双向覆盖**同步进 DeepSeek
Harness 的 `llm-pi-ai` provider 路由：上游新增即加入，上游删除即移除，并默认滤掉网关里常见的
向量 / 重排 / 语音 / 图像 / 翻译等非对话模型。

### 特性

- `providers.<providerName>.models` 双向同步（新增 / 移除 / 无变更不写文件）。
- 可编辑的排除规则（`excludePatterns`，大小写不敏感正则）。
- 字段保留：列表中原有的模型保留其自定义字段（`contextWindow`、`reasoningEfforts` 等），
  只有真正的新 id 才按 `{ id, name }` 生成。
- 设置页表单：总开关、接口地址、密钥、目标路由、周期、排除规则、调试日志都在网页里改，一次原子写入
  保存全部改动；已覆盖的字段会标注，并可单字段恢复默认。同时显示上次同步时间、结果、错误、当前路由
  里的模型数，并提供「立即同步」按钮。另有 `/newapi-sync` 命令。
- 三种触发：启动补同步（激活后 20 秒）、定时、手动。
- 安全阀保证上游异常不会毁掉你的配置（见下）。

### 安装

```bash
dsh plugin --profile web add dsh-newapi-model-sync   # 从 npm（发布后）

# 或从源码
git clone https://github.com/PellyLee/dsh-newapi-model-sync.git
dsh plugin --profile web add ./dsh-newapi-model-sync

dsh plugin --profile web add /path/to/dsh-newapi-model-sync  # 从任意本地目录
```

profile 名不是 `web` 就换成你自己的。安装后**刷新一次浏览器页面**（客户端半区在页面加载时注入；
Host 侧与定时同步无需刷新）。但如果升级改动了 `Config`，还需要**重启 Host**：默认不开源码模块监听
（`hmr.root: []`），运行中的进程会一直拿着旧 schema。

### 配置

打开**设置 → New API 同步**：上表里的每一项都能在网页里改。页面读的是 Host 的实时值，从组合层继承
下来的字段会标「已覆盖」并可以单字段恢复默认，所有改动**一次原子写入**保存（半填的表单不会让插件
停在两个状态之间），保存即时生效（`volatile` 字段，不重启、不重挂载）。校验不过的字段会就地报错，
保存按钮同时禁用，不会把非法值写进配置。

同样的值也存在活动 profile patch（例如 `profiles/web/cordis.patch.yml`）里本插件条目的 `config`，
适合这几种情况：第一次运行还没有浏览器、想把整个 profile 纳入版本管理、或者你就是更喜欢改 YAML：

```yaml
- id: newapi-model-sync
  name: 'dsh-newapi-model-sync'
  config:
    enabled: true
    baseUrl: https://newapi.example.com/v1
    apiKey: sk-xxxxxxxx        # 只用于 GET /models；在本文件里是明文
    providerName: newapi
    intervalMinutes: 10
```

`id` 不要改：设置页就是按这个条目 id 作为命名空间寻址的；改了 id 页面会**整块消失**（不会再误配别的
插件），这时按新 id 恢复即可。

手工编辑的 patch 文件只有在 HMR 覆盖 profile 文档时才会热加载（默认不开，`hmr.root: []`），否则请
**重启 Host**。设置页显示的永远是运行中插件真正看到的值，所以它是确认改动有没有生效的最快办法。

### 安全阀

- HTTP 非 2xx、超时（30 秒）、响应不是 OpenAI 兼容列表 → 报错并跳过本轮写入。
- 上游返回空列表，或全部被排除规则滤光 → 跳过写入并提示放宽规则。
- 列表无差异不写文件；原列表为空时直接接管。
- 若被删的模型恰好是当前默认模型，摘要里会追加警告。
- 写错的单条正则会被单独告警并忽略，不影响其余规则。

### 注意与限制

- **本插件接管整个 `models` 列表**：不要再手工维护它（手工加的会在下一轮被覆盖）；路由其它字段
  不受影响。
- `/v1/models` 不返回能力参数，新增模型按 pi-ai 默认值处理。
- `syncRequestAt` 与三个状态字段是 `volatile`（必须能被网页读到，同时允许不重启就生效），并按
  `hidden()` 表达「不要拿去当表单项」的意图；`0.2.0-rc.2` 里没有任何界面消费 `hidden`（`autoGenerate`
  也一样没人消费），所以真正的保护是本插件自己注册页面、不提供这些字段的编辑控件。请勿手工修改它们。
- `apiKey` 声明了 `role('secret')`：harness 会在每次配置读取时把它从 `value`/`base`/`user` 里剥掉，
  浏览器只能拿到 `secrets: [{ path, set }]`，也就是**有没有配过**。因此页面上它是只写字段——留空表示
  保持原值，「清除密钥」才会真的删除。磁盘上的 profile patch 仍是明文，请保持该文件仅属主可读写
  （`chmod 600`）。
- 升级后请**刷新页面**：客户端半区按文件内容分发，`npm test` 通过但网页里仍是旧表单，几乎都是没刷新。
  若页面显示「Host 当前没有提供本插件条目」，多半是条目 `id` 被改动或该条目被停用。
- 客户端半区依赖 harness 的内部形状（`settings.section` 槽位、`ctx.configForms` 的快照与写入队列、
  `ctx.remote.settings.describe`），DSH 升级可能需要跟着改；支持范围以上面的 peer 区间为准。
- 排错：页面报「读取设置失败: cannot get property "remote.settings" without inject」说明浏览器里还是
  1.0.1 之前的客户端半区，刷新页面即可，仍报错就重启 Host。页面提示「Host 当前没有提供本插件条目」，
  是条目 `id` 被改动或该条目被停用。控件全灰是这份部署只读（`describe` 回了 `writable: false`），或
  本页面没连到本机 Host（远程未认证页面把偏好留在进程内，不会落盘）。同步确实跑了但页面一直显示
  「从未同步」，说明 Host 还在跑 1.0.1 之前的 `Config`（那时状态字段不是 volatile，传不到浏览器）：
  重启 Host。
- Host 侧文案目前只有中文（摘要、命令描述、错误信息）；设置页本身是 zh/en 双语。

### 排错

- **完全没有同步** → 看设置页的「错误」；最常见的是 `baseUrl` 为空或令牌被拒。
- **「读取设置失败: cannot get property "remote.settings" without inject」** → 浏览器里还是 1.0.1
  之前的客户端半区。升级后刷新页面；刷新后仍在报就重启 Host。
- **「Host 当前没有提供本插件条目」** → 页面按条目 `id` 寻址命名空间，说明 `id` 被改动或该条目被停用。
- **所有控件都是灰的** → 这份部署只读，或者本页面没连到本机 Host（远程未认证页面把偏好留在进程内）。
- **确实同步了但页面还是「从未同步」** → Host 仍在跑 1.0.1 之前的 `Config`（状态字段不是 volatile）：
  重启 Host。
- **需要的模型不见了** → 命中了排除规则，从 `excludePatterns` 里删掉那条正则。
- **要逐步线索** → 设 `debugFile` 指向一个路径后复现，每一步都会追加进去。
- **装完看不到面板** → 刷新网页。

### 卸载

在插件管理里移除 bundle 即可；卸载**不会**改动 `llm-pi-ai` 中已经同步好的模型列表。
