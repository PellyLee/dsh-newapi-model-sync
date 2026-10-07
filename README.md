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
- **Settings section**: a card under *Settings* with the last sync time, its result, any error, the
  number of models currently in the route, and a **Sync now** button.
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

Options are **not** edited in the web UI: in `0.2.0-rc.2` the Settings → Plugins page renders no
form for a third-party plugin's Config (only built-in features register tabs there). They live in the
`config:` block of this plugin's entry in the **active profile patch**, e.g.
`profiles/web/cordis.patch.yml`:

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

Keep the `id` — the settings card reads its state from the namespace named after that entry id.

Every field above is declared `volatile`, so the Host can apply an edit without remounting the
plugin; whether a hand-edited patch file is picked up live depends on your HMR configuration, so
**restart the Host if a change does not take effect**. The settings card then shows what the running
plugin actually sees.

Fields:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `enabled` | switch | on | Master switch; the timer and manual runs both obey it. |
| `baseUrl` | text | *(empty)* | Your New API base, e.g. `https://newapi.example.com/v1`. `/models` is appended; a value without a scheme is treated as `https://`. Nothing is fetched until this is set. |
| `apiKey` | secret | *(empty)* | `sk-` token used **only** for `GET /models`; never written into the route config. Stored as **plain text** in the profile patch — keep that file owner-only (`chmod 600`). |
| `providerName` | text | `newapi` | The `llm-pi-ai` provider route to mirror into. |
| `intervalMinutes` | number (≥1) | `10` | Auto-sync period. |
| `excludePatterns` | string[] | see below | Case-insensitive regexes; a matching model id is excluded. |
| `preserveCustomFields` | switch | on | Keep per-model custom fields for ids already present. |
| `syncRequestAt` | number | `0` | **Internal trigger** written by the *Sync now* button. Do not edit by hand. |
| `debugFile` | text | *(empty)* | Optional file path; when set, every step is appended there. Clear it to stop tracing. |
| `lastSyncAt` / `lastSyncSummary` / `lastSyncError` | read-only | — | Last sync time, result summary, error. Written back by the plugin; `volatile` so the card can read it, `hidden` so no form offers it for editing. |

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

- **Nothing syncs** → check `lastSyncError` on the settings card; the most common cause is an empty
  `baseUrl` or a rejected token.
- **`cannot get property "remote.settings" without inject`** → that client half predates 1.0.1, which
  declares `remote.settings` in `inject`. Upgrade and reload the page; restart the Host if the
  message survives the reload.
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
- `syncRequestAt` and the three status fields are `volatile().hidden()`: *volatile* so the card can
  read them, *hidden* so no generated form offers them as inputs. Do not edit them by hand.
- **The client half uses harness-internal shapes** (`settings.section` slot,
  `ctx.remote.settings.mutate`). A DSH upgrade may require corresponding changes; treat the peer
  range above as the supported range.
- **Host-side messages are Chinese only** (summaries, `/newapi-sync` description, error strings).
  The settings panel itself is localized (zh/en). Localizing the host half is a welcome
  contribution.
- Before 1.0.1 the status fields were not `volatile`, so each write-back was a non-volatile config
  change that remounted the plugin — which is what the 2-minute boot guard was bounding. They are
  `volatile` now; the guard still bounds any genuine remount burst.

## Development notes

- During activation the plugin runs inside the Loader's HMR transaction, where a direct
  `configEditor.edit` throws `HMR transactions cannot be nested`. All writes therefore go through
  an `exclusive()` helper that runs the callback from a clean context via
  `ctx.hmr.executing.exit(fn)`.
- **The client half must declare `remote.settings`, not just `remote`.** Each generated remote
  namespace is its own service key in the fiber's inject set, so reading `ctx.remote.settings`
  without it throws `cannot get property "remote.settings" without inject`.
- **Only `volatile` fields reach the browser.** `dsh-settings` projects a Config through
  `volatileForm` before `remote.settings.describe()` answers, so any value the card displays must be
  `.volatile()`; add `.hidden()` so generated forms do not offer it for editing.
- `describe()` answers `{ writable, hasDocument, namespaces: [...] }`, keyed by the **Loader entry
  id**, and each row carries `value` plus a `revision` for compare-and-set writes. `mutate()` answers
  `{ ok: false, error: { code, message } }`, with `settings/conflict` on a stale revision.
- `loader/volatile-update` fires for *every* volatile write, including this plugin's own status
  write-back, so the listener re-arms the timer only when the cadence actually changed.
- Status fields are `volatile` since 1.0.1 (they must persist *and* be readable by the card);
  `syncRequestAt` was always volatile, so an applied edit emits `loader/volatile-update`, which the
  listener uses to check for a manual request.

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
- 设置页分区卡片：上次同步时间、结果、错误、当前路由里的模型数，以及「立即同步」按钮。
  另有 `/newapi-sync` 命令。配置项本身在 profile patch 里改（见「配置」一节）。
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

配置项**不在网页里改**：`0.2.0-rc.2` 的「设置 → 插件」只为内置功能注册标签页，不会为第三方插件的
Config 生成表单。它们位于活动 profile patch（例如 `profiles/web/cordis.patch.yml`）里本插件条目的
`config`：

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

`id` 不要改：设置页卡片是按这个条目 id 作为命名空间去读状态的。下列字段都声明为 `volatile`，改动
不一定要重启才生效（取决于你的 HMR 配置），**改了没反应就重启 Host**。字段含义见上表：
`enabled` 总开关、`baseUrl` 实例地址（例如 `https://newapi.example.com/v1`，**默认为空，填了才会
同步**）、`apiKey` 仅用于 `GET /models` 的密钥、`providerName` 目标路由、`intervalMinutes` 周期、
`excludePatterns` 排除规则、`preserveCustomFields` 字段保留、`debugFile` 排错日志、
`lastSyncAt/Summary/Error` 只读状态。

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
- `syncRequestAt` 与三个状态字段都是 `volatile().hidden()`：volatile 让卡片读得到，hidden 让表单
  不显示它们，请勿手工修改。
- 卡片报「读取设置失败: cannot get property "remote.settings" without inject」，说明浏览器里还是
  1.0.1 之前的客户端半区：升级后刷新页面；仍报错就重启 Host。
- 若同步确实执行了但卡片一直显示「从未同步」，说明 Host 还在跑 1.0.1 之前的 `Config`（状态字段当时
  不是 volatile，传不到浏览器）：重启 Host。
- 1.0.1 之前状态字段不是 volatile，每次写回都属于非 volatile 配置变更、会重挂载插件（这正是 2 分钟
  启动保护针对的情况）；现在它只在真正的重挂载风暴时起作用。
- 客户端半区依赖 harness 内部形状（`settings.section` 槽位、`ctx.remote.settings.mutate`），
  DSH 升级可能需要跟着改；支持范围以上面的 peer 区间为准。
- Host 侧文案目前只有中文（摘要、命令描述、错误信息）；设置面板本身是 zh/en 双语。

### 卸载

在插件管理里移除 bundle 即可；卸载**不会**改动 `llm-pi-ai` 中已经同步好的模型列表。
