/**
 * New API Model Sync — Host half.
 * Polls GET {baseUrl}/models against a New API instance and mirrors the filtered
 * model list into the `llm-pi-ai` provider route in the active profile patch.
 * @module dsh-newapi-model-sync
 */
import z from '@deepseek-ai/schemastery';
import { appendFileSync } from 'node:fs';

const name = 'newapi-model-sync';
const inject = ['timer', 'commands', 'configEditor', 'hmr'];

/** Route entry id this plugin rewrites in the profile patch. */
const LLM_ENTRY_ID = 'llm-pi-ai';
/** Own profile row id, used for status persistence. */
const OWN_ENTRY_ID = 'newapi-model-sync';
/** Remount guard: a fresh boot within this window never re-syncs immediately. */
const BOOT_GUARD_MS = 120_000;
/** Delay after activation before the boot sync runs. */
const BOOT_SYNC_DELAY_MS = 20_000;

/** Default patterns hiding obvious non-chat models; user-editable. */
const DEFAULT_EXCLUDES = [
  '^@cf/', 'embedding', 'bge-', 'rerank', 'ocr', 'whisper', 'tts',
  'deepgram', 'aura-', 'melotts', 'sensevoice', 'smart-turn', 'speech',
  'audio', 'asr', 'gsr', 'stable-diffusion', 'dreamshaper', 'flux-',
  'leonardo', 'runwayml', 'lyria', 'diffusiongemma', 'resnet', 'distilbert',
  'ising', 'm2m100', 'indictrans', 'translate', 'hunyuan-mt', 'safety',
  'guard', 'allam', 'riva', 'nemotron-parse', 'image',
];

const Config = z.object({
  /** Master switch; the scheduler and manual runs obey it. */
  enabled: z.boolean().default(true).volatile(),
  /** New API base, typically ending in /v1; /models is appended. Empty until configured. */
  baseUrl: z.string().default('').volatile(),
  /** Bearer token used only for GET /models; never written into the route config. */
  apiKey: z.string().role('secret').default('').volatile(),
  /** llm-pi-ai provider route whose models list is mirrored. */
  providerName: z.string().default('newapi').volatile(),
  /** Auto-sync period, minutes, minimum 1. */
  intervalMinutes: z.number().step(1).min(1).default(10).volatile(),
  /** Case-insensitive regexes; a model id matching any is excluded. */
  excludePatterns: z.array(z.string()).default(DEFAULT_EXCLUDES).volatile(),
  /** Keep per-model custom fields (contextWindow etc.) from the previous list by id. */
  preserveCustomFields: z.boolean().default(true).volatile(),
  /** Volatile trigger: the settings-page button bumps it to start a manual sync. */
  syncRequestAt: z.number().default(0).volatile().hidden(),
  /** Optional trace file path for diagnosis; empty disables file tracing. */
  debugFile: z.string().default('').volatile(),
  /** Last completed sync timestamp, host-written. Volatile so the settings card reads
   * it from `remote.settings.describe()` (only volatile fields reach that payload),
   * and hidden so no generated form offers it for editing. */
  lastSyncAt: z.number().default(0).volatile().hidden(),
  /** Human-readable outcome of the last completed sync. */
  lastSyncSummary: z.string().default('').volatile().hidden(),
  /** Last sync failure message; empty when healthy. */
  lastSyncError: z.string().default('').volatile().hidden(),
});

/** Build the models endpoint from a configured base URL. */
function modelsUrl(base) {
  let raw = String(base || '').trim();
  if (!raw) throw new Error('baseUrl 为空，请在设置中填写 New API 地址');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const url = new URL(raw);
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!/\/models$/i.test(url.pathname)) url.pathname += '/models';
  return url.toString();
}

/** True when the id matches any valid exclusion pattern. */
function isExcluded(id, patterns, logger) {
  for (const p of patterns || []) {
    try {
      if (new RegExp(p, 'i').test(id)) return true;
    } catch (e) {
      logger?.warn?.(`newapi-sync: 忽略无效排除模式 ${JSON.stringify(p)}`);
    }
  }
  return false;
}

/**
 * Fetch and normalize the upstream model list.
 * @returns {Promise<string[]>} model ids, upstream order, deduped, non-empty.
 */
async function fetchModelIds(url, apiKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const body = await res.json();
    const raw = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.models)
        ? body.models
        : null;
    if (!raw) throw new Error('响应缺少 data 数组，可能不是 OpenAI 兼容列表');
    const ids = [];
    const seen = new Set();
    for (const item of raw) {
      const id = typeof item === 'string' ? item : item?.id;
      if (typeof id === 'string' && id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    if (!ids.length) throw new Error('上游返回空列表，已跳过写入以保护现有配置');
    return ids;
  } finally {
    clearTimeout(timer);
  }
}

function apply(ctx, config) {
  const log = ctx.logger;
  // Parsed Config exposes every field as a live reference; values travel via .get().
  const g = (key) => {
    const ref = config?.[key];
    if (ref && typeof ref.get === 'function') return ref.get();
    return ref;
  };
  const dbg = (m) => {
    const f = String(g('debugFile') || '');
    if (!f) return;
    try { appendFileSync(f, `[${new Date().toISOString()}] ${m}\n`); } catch { /* trace only */ }
  };
  dbg(`apply: enabled=${g('enabled')} baseUrl=${g('baseUrl')} interval=${g('intervalMinutes')} lastSyncAt=${g('lastSyncAt') || 0}`);
  let syncing = false;
  let lastTrigger = Number(g('syncRequestAt')) || 0;
  let intervalHandle = null;

  /** Addressable rows compare by the raw patch id (Entry.id is qualified). */
  const findEntry = (id) => {
    const all = ctx.configEditor.entries();
    const hit = all.find((e) => e.options?.id === id);
    if (!hit) dbg(`findEntry MISS ${id}; have: ${all.map((e) => e.options?.id).join(',').slice(0, 400)}`);
    return hit || null;
  };

  /** Composed profile values for one entry id, or null. */
  const layerOf = (entryId) => {
    const found = ctx.configEditor.configuration().find((x) => x.entry?.options?.id === entryId);
    if (!found) return null;
    return { ...found.inherited, ...found.override };
  };

  /** Run an edit from a clean async context. Activation inherits the loader's
   * HMR transaction, so callbacks scheduled here would otherwise be rejected
   * as nested transactions; configEditor keeps its own serialization. */
  function exclusive(fn) {
    const h = ctx.hmr;
    if (h && h.executing && typeof h.executing.exit === 'function') return h.executing.exit(fn);
    return fn();
  }

  /** Persist last-run status as ordinary config fields on our own row. */
  async function writeStatus(fields) {
    try {
      const entry = findEntry(OWN_ENTRY_ID);
      if (!entry) { dbg('writeStatus: own entry not found'); return; }
      await exclusive(() => ctx.configEditor.edit(entry, (current) => ({ ...(current || {}), ...fields })));
      dbg(`writeStatus ok: at=${fields.lastSyncAt} err=${fields.lastSyncError || '-'}`);
    } catch (e) {
      dbg(`writeStatus FAIL: ${String(e?.message ?? e)}`);
      log?.warn?.(`newapi-sync: 状态写回失败：${String(e?.message ?? e)}`);
    }
  }

  async function run(kind) {
    if (syncing) return { ok: false, text: '已有一次同步正在进行，请稍候。' };
    if (!g('enabled')) {
      return { ok: false, text: '自动同步已停用：请在设置页把「功能开关」打开。' };
    }
    const key = String(g('apiKey') || '');
    if (!key) return { ok: false, text: '缺少 API 密钥：请在设置页填写 New API 的 sk- 令牌。' };
    syncing = true;
    dbg(`run(${kind}) start`);
    let errorText = '';
    try {
      const url = modelsUrl(g('baseUrl'));
      const providerName = String(g('providerName') || 'newapi');
      const remoteIds = await fetchModelIds(url, key);
      const kept = remoteIds.filter((id) => !isExcluded(id, g('excludePatterns'), log));
      dbg(`fetch ok: remote=${remoteIds.length} kept=${kept.length}`);
      if (!kept.length) {
        throw new Error(`上游 ${remoteIds.length} 个模型全部被排除规则过滤，已跳过写入。请放宽 excludePatterns。`);
      }
      const llmEntry = findEntry(LLM_ENTRY_ID);
      if (!llmEntry) throw new Error(`配置中找不到 ${LLM_ENTRY_ID} 条目，无法写入模型列表`);
      const llmLayer = layerOf(LLM_ENTRY_ID) || {};
      const providers = llmLayer.providers || {};
      const route = providers[providerName];
      if (!route || !Array.isArray(route.models)) {
        throw new Error(`provider 路由 ${providerName} 不存在或没有 models 列表`);
      }
      const oldEntries = route.models.filter((m) => m && typeof m.id === 'string');
      const oldIds = oldEntries.map((m) => m.id);
      const oldById = new Map(oldEntries.map((m) => [m.id, m]));
      const preserve = !!g('preserveCustomFields');
      const newEntries = kept.map((id) => {
        const old = preserve ? oldById.get(id) : undefined;
        return old ? { ...old, id, name: old.name || id } : { id, name: id };
      });
      const added = kept.filter((id) => !oldIds.includes(id));
      const removed = oldIds.filter((id) => !kept.includes(id));
      const changed = JSON.stringify(oldEntries) !== JSON.stringify(newEntries);
      if (changed) {
        await exclusive(() => ctx.configEditor.edit(llmEntry, (current) => {
          const curProviders = { ...(current?.providers || {}) };
          curProviders[providerName] = { ...curProviders[providerName], models: newEntries };
          return { ...(current || {}), providers: curProviders };
        }));
      }
      let summary = `共 ${kept.length} 个模型：新增 ${added.length}，移除 ${removed.length}${changed ? '' : '（无变更）'}`;
      if (added.length) log.info(`newapi-sync: 新增 ${added.join(', ')}`);
      if (removed.length) log.info(`newapi-sync: 移除 ${removed.join(', ')}`);
      const defLayer = layerOf('agent-default-model') || {};
      if (removed.includes(defLayer.model) && defLayer.provider === providerName) {
        summary += `；注意：默认模型 ${defLayer.model} 已被移除`;
        log.warn(`newapi-sync: 默认模型 ${defLayer.model} 已从 newapi 移除`);
      }
      if (!changed && kind === 'auto') return { ok: true, text: summary };
      // All non-idle runs persist status; the boot guard bounds any remount loop.
      await writeStatus({ lastSyncAt: Date.now(), lastSyncSummary: summary, lastSyncError: '' });
      log.info(`newapi-sync: ${kind} 同步完成：${summary}`);
      return { ok: true, text: summary };
    } catch (e) {
      errorText = String(e?.message ?? e);
      dbg(`run(${kind}) error: ${errorText}`);
      log.error(`newapi-sync: ${kind} 同步失败：${errorText}`);
      await writeStatus({ lastSyncAt: Date.now(), lastSyncSummary: '', lastSyncError: errorText });
      return { ok: false, text: `同步失败：${errorText}` };
    } finally {
      syncing = false;
    }
  }

  /** (Re)arm the periodic loop from the current volatile config. */
  let timerShape = '';
  function arm() {
    if (intervalHandle != null) {
      intervalHandle();
      intervalHandle = null;
    }
    timerShape = `${g('enabled') ? 1 : 0}|${Math.max(1, Number(g('intervalMinutes')) || 10)}`;
    if (!g('enabled')) return;
    const minutes = Math.max(1, Number(g('intervalMinutes')) || 10);
    intervalHandle = ctx.interval(() => { void run('auto'); }, minutes * 60_000);
  }

  arm();

  // Catch-up run shortly after activation; the guard bounds any remount burst
  // (a fresh boot within the window never re-syncs immediately).
  if (g('enabled') && Date.now() - (Number(g('lastSyncAt')) || 0) > BOOT_GUARD_MS) {
    ctx.timeout(() => { void run('boot'); }, BOOT_SYNC_DELAY_MS);
  }

  ctx.on('loader/volatile-update', () => {
    // Status write-backs arrive here as well, so only a real change of cadence
    // re-arms: a completed sync must not restart its own countdown.
    const shape = `${g('enabled') ? 1 : 0}|${Math.max(1, Number(g('intervalMinutes')) || 10)}`;
    if (shape !== timerShape) arm();
    const trigger = Number(g('syncRequestAt')) || 0;
    if (trigger && trigger !== lastTrigger) {
      lastTrigger = trigger;
      void run('manual');
    }
  });

  ctx.effect(function* () {
    yield ctx.commands.register({
      name: 'newapi-sync',
      description: '立即从 New API 拉取模型列表并同步到当前配置',
      handler: () => run('command').then((r) => ({ kind: r.ok ? 'success' : 'error', text: r.text })),
    });
  }, 'newapi-sync command');

  return () => {
    if (intervalHandle != null) intervalHandle();
  };
}

export { apply, inject, name, Config };
