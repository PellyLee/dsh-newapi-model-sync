/**
 * Headless render test for the browser half of this plugin (`client.js`).
 *
 * The bundle is a `window.__ModuleLoader__.load({ factory(require) … })` record
 * whose page is plain React: settings snapshot in, element tree out. This test
 * evaluates it with a minimal React (no DOM, no renderer package) and a fake
 * cordis `ctx`, then asserts what the page renders and which writes its
 * handlers issue.
 *
 * What it proves: the field model, staging, validation, secret handling,
 * read-only gating, status rendering, and the exact ops sent to
 * `ConfigForm.mutate` / `.set`.
 * What it cannot prove: that the real Settings shell mounts the slot, that the
 * real mirror folds Host answers in, or that a save survives Host validation —
 * those need the connected page.
 *
 * Run: node test/client-render.mjs   (or: npm test)
 * @module test/client-render
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

const ENTRY = 'newapi-model-sync';
const LLM_NS = 'llm-pi-ai';

/** A sync click arms a bounded poll; stub timers so it can never run here. */
const armed = { intervals: 0, timeouts: 0 };
globalThis.setInterval = () => { armed.intervals += 1; return { fake: true }; };
globalThis.clearInterval = () => {};
globalThis.setTimeout = () => { armed.timeouts += 1; return { fake: true }; };
globalThis.clearTimeout = () => {};

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (e) {
    failed += 1;
    const detail = String(e && e.message ? e.message : e).split('\n').slice(0, 4).join('\n    ');
    console.error(`  ✗ ${label}\n    ${detail}`);
  }
}

/** Minimal React whose hook state is seeded per render. */
function makeReact(seedState = []) {
  let stateIndex = 0;
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat(Infinity) };
    },
    useState: (initial) => {
      const index = stateIndex;
      const value = index < seedState.length ? seedState[index] : initial;
      stateIndex += 1;
      return [value, () => {}];
    },
    useRef: (initial) => ({ current: initial === undefined ? null : initial }),
    useEffect: () => {},
    useCallback: (fn) => fn,
    useSyncExternalStore: (subscribe, getSnapshot) => {
      subscribe(() => {});
      return getSnapshot();
    },
  };
  return React;
}

/** Evaluate the bundle, run its factory with a fake `require`, return the plugin record. */
function loadModule(React) {
  let captured;
  const window = { __ModuleLoader__: { load: (mod) => { captured = mod; } } };
  new Function('window', source)(window);
  return captured.factory((spec) => {
    if (spec === 'react') return React;
    throw new Error(`unexpected client require: ${spec}`);
  });
}

const baseValue = {
  enabled: true,
  baseUrl: 'https://newapi.example.com/v1',
  providerName: 'newapi',
  intervalMinutes: 10,
  excludePatterns: ['^@cf/', 'embedding'],
  preserveCustomFields: true,
  debugFile: '',
  syncRequestAt: 0,
  lastSyncAt: 1760000000000,
  lastSyncSummary: '共 53 个模型：新增 0，移除 0（无变更）',
  lastSyncError: '',
};

function snapshotOf({ status = 'ready', value = {}, writable = true, mode = 'host' } = {}) {
  return {
    status,
    value: { ...baseValue, ...value },
    base: {},
    user: { baseUrl: 'https://old/' },
    revision: 7,
    writable,
    mode,
  };
}

function faceOf({ writable = true, secretSet = true, value = {}, namespaces } = {}) {
  if (namespaces) return { status: 'ready', error: null, view: { writable, hasDocument: true, namespaces } };
  return {
    status: 'ready',
    error: null,
    view: {
      writable,
      hasDocument: true,
      namespaces: [
        {
          ns: ENTRY,
          autoGenerate: true,
          applies: 'live',
          revision: 7,
          schema: {},
          value: { ...baseValue, ...value },
          base: {},
          user: { baseUrl: 'https://old/' },
          secrets: [{ path: ['apiKey'], set: secretSet }],
        },
        {
          ns: LLM_NS, autoGenerate: true, applies: 'live', revision: 3, schema: {},
          value: { providers: { newapi: { models: [{ id: 'a' }, { id: 'b' }] } } },
          base: {}, user: {}, secrets: [],
        },
      ],
    },
  };
}

/** Render one page tree against fake settings services. */
function draw({ locale = 'zh', snapshot = snapshotOf(), face = faceOf(), state = [] } = {}) {
  const React = makeReact(state);
  const mod = loadModule(React);
  const calls = { mutate: [], set: [] };
  const dicts = {};
  const form = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    mutate: async (ops) => { calls.mutate.push(ops); return true; },
    set: async (field, value) => { calls.set.push([field, value]); return true; },
  };
  const mirror = { subscribe: () => () => {}, getSnapshot: () => face };
  let registration;
  const ctx = {
    locale: {
      register: (ns, dict) => { dicts[ns] = dict; },
      bind: (ns) => {
        const table = (dicts[ns] || {})[locale] || {};
        return (key, params) => String(table[key] ?? key).replace(/\{(\w+)\}/g, (m, n) => (params && n in params ? String(params[n]) : m));
      },
    },
    configForms: { get: (id) => ({ id, ...form }), describe: () => mirror },
    remote: { settings: { describe: async () => ({ ok: true, value: face.view }) } },
    slots: {
      inject: (name, build) => { build(); return () => {}; },
      register: (options, component) => { registration = { options, component }; return () => {}; },
    },
  };
  mod.apply(ctx);
  assert.ok(registration, 'apply() never reached ctx.slots.register');
  const element = registration.component();
  const tree = element.type(element.props);
  return { tree, calls, registration, locale };
}

function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  return text(node.children);
}

function walk(node, visit) {
  if (!node) return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return; }
  if (typeof node !== 'object') return;
  visit(node);
  walk(node.children, visit);
}

/** Elements of a type whose visible text equals or contains `needle`. */
function nodes(tree, type, needle, exact = false) {
  const hits = [];
  walk(tree, (n) => {
    if (n.type !== type) return;
    const label = text(n);
    if (needle === undefined || (exact ? label === needle : label.includes(needle))) hits.push(n);
  });
  return hits;
}

const has = (tree, needle) => text(tree).includes(needle);

console.log('client.js — headless render checks\n');

// ---- module contract -----------------------------------------------------
{
  const mod = loadModule(makeReact());
  check('exports inject and apply', () => {
    assert.ok(Array.isArray(mod.inject));
    assert.equal(typeof mod.apply, 'function');
  });
  check('inject declares every ctx service the page touches', () => {
    for (const name of ['slots', 'locale', 'remote', 'remote.settings', 'configForms']) {
      assert.ok(mod.inject.includes(name), `missing ${name}: ${JSON.stringify(mod.inject)}`);
    }
  });
}

// ---- defaults: writable, configured instance -----------------------------
{
  const { tree } = draw();
  const body = text(tree);
  check('renders title and both panels', () => {
    assert.ok(body.includes('New API 模型同步'));
    assert.ok(body.includes('同步配置'));
    assert.ok(body.includes('同步状态'));
  });
  check('status rows show host values', () => {
    assert.ok(body.includes('共 53 个模型：新增 0，移除 0（无变更）'));
    assert.ok(body.includes('已同步模型数: 2'));
    assert.ok(body.includes('上次同步: '));
    assert.ok(!body.includes('从未同步'));
  });
  check('fields are prefilled from the settings snapshot', () => {
    const url = nodes(tree, 'input').find((n) => n.props.placeholder === 'https://newapi.example.com/v1');
    assert.equal(url.props.value, 'https://newapi.example.com/v1');
    const interval = nodes(tree, 'input').find((n) => n.props.type === 'number');
    assert.equal(interval.props.value, '10');
    const area = nodes(tree, 'textarea')[0];
    assert.equal(area.props.value, '^@cf/\nembedding');
    assert.ok(body.includes('当前 2 条规则'));
  });
  check('the secret never renders a value, only its configured state', () => {
    const secret = nodes(tree, 'input').find((n) => n.props.type === 'password');
    assert.equal(secret.props.value, '');
    assert.equal(secret.props.placeholder, '保持不变');
    assert.ok(body.includes('已配置密钥'));
    assert.ok(!baseValue.apiKey, 'fixture must not carry a key literal');
  });
  check('override marker and reset affordance appear for an overridden field', () => {
    assert.ok(body.includes('已覆盖'));
    assert.equal(nodes(tree, 'button', '恢复默认').length, 1);
  });
  check('save is disabled while nothing is staged', () => {
    const save = nodes(tree, 'button', '保存', true)[0];
    assert.ok(save.props.disabled);
    assert.ok(!body.includes('已修改'));
  });
  check('sync now is enabled', () => {
    const sync = nodes(tree, 'button', '立即同步', true)[0];
    assert.equal(sync.props.disabled, false);
  });
}

// ---- staged edits, validation, and the write path ------------------------
{
  const draft = {
    baseUrl: { op: 'set', text: 'https://other.example/v2' },
    intervalMinutes: { op: 'set', text: '30' },
    excludePatterns: { op: 'set', text: '^foo\n^bar\n\n' },
    debugFile: { op: 'unset' },
    apiKey: { op: 'set', text: 'sk-new-one' },
  };
  const { tree, calls } = draw({ state: [draft, 'sk-new-one', false, false, ''] });
  check('dirty count and enabled save reflect the draft', () => {
    assert.ok(text(tree).includes('已修改 5 项'));
    assert.equal(nodes(tree, 'button', '保存', true)[0].props.disabled, false);
  });
  check('a staged revert is marked and hides the reset button for that field', () => {
    assert.ok(text(tree).includes('将恢复默认'));
  });
  const save = nodes(tree, 'button', '保存', true)[0];
  await save.props.onClick();
  check('one atomic mutation carries every staged field, in field order', () => {
    assert.equal(calls.mutate.length, 1);
    assert.deepEqual(calls.mutate[0], [
      { op: 'set', path: ['baseUrl'], value: 'https://other.example/v2' },
      { op: 'set', path: ['apiKey'], value: 'sk-new-one' },
      { op: 'set', path: ['intervalMinutes'], value: 30 },
      { op: 'set', path: ['excludePatterns'], value: ['^foo', '^bar'] },
      { op: 'unset', path: ['debugFile'] },
    ]);
  });
}

{
  const draft = { baseUrl: { op: 'set', text: 'not a url' }, intervalMinutes: { op: 'set', text: '0' } };
  const { tree, calls } = draw({ state: [draft, '', false, false, ''] });
  check('invalid staged values block the save and explain themselves', () => {
    const body = text(tree);
    assert.ok(body.includes('请填写 http:// 或 https:// 开头的地址。'));
    assert.ok(body.includes('请填写不小于 1 的整数。'));
    assert.ok(nodes(tree, 'button', '保存', true)[0].props.disabled);
  });
  await nodes(tree, 'button', '保存', true)[0].props.onClick();
  check('a blocked save issues no write at all', () => {
    assert.equal(calls.mutate.length, 0);
  });
}

{
  const draft = { excludePatterns: { op: 'set', text: '^ok\n([unclosed' } };
  const { tree } = draw({ state: [draft, '', false, false, ''] });
  check('a bad regular expression names its line', () => {
    const body = text(tree);
    assert.ok(body.includes('第 2 行不是合法正则'), body.slice(0, 400));
  });
}

{
  const emptyKey = { apiKey: { op: 'set', text: '   ' } };
  const { tree } = draw({ state: [emptyKey, '   ', false, false, ''] });
  check('clearing the key box without a literal is refused, not written', () => {
    assert.ok(text(tree).includes('不能为空。'));
    assert.ok(nodes(tree, 'button', '保存', true)[0].props.disabled);
  });
}

// ---- sync action ---------------------------------------------------------
{
  const { tree, calls } = draw();
  const before = armed.intervals;
  await nodes(tree, 'button', '立即同步', true)[0].props.onClick();
  check('sync now writes only the volatile trigger field', () => {
    assert.equal(calls.set.length, 1);
    const [field, value] = calls.set[0];
    assert.equal(field, 'syncRequestAt');
    assert.ok(value > 1_700_000_000_000 && value <= Date.now() + 1000, String(value));
  });
  check('a triggered sync arms the bounded status refresh', () => {
    assert.equal(armed.intervals, before + 1);
  });
}

// ---- read-only and unavailable states ------------------------------------
{
  const { tree } = draw({ snapshot: snapshotOf({ writable: false, mode: 'memory' }), face: faceOf({ writable: false }) });
  const body = text(tree);
  check('memory mode explains that nothing persists and disables every control', () => {
    assert.ok(body.includes('本页面未连接到本机 Host'));
    assert.ok(nodes(tree, 'button', '保存', true)[0].props.disabled);
    assert.ok(nodes(tree, 'button', '立即同步', true)[0].props.disabled);
  });
  check('no reset link is offered when the document is read-only', () => {
    assert.equal(nodes(tree, 'button', '恢复默认').length, 0);
  });
}

{
  const { tree } = draw({ snapshot: snapshotOf({ writable: false, mode: 'host' }), face: faceOf({ writable: false }) });
  check('a read-only deployment says so instead of the memory warning', () => {
    const body = text(tree);
    assert.ok(body.includes('当前部署的设置为只读'));
    assert.ok(!body.includes('不会落盘'));
  });
}

{
  const { tree } = draw({ snapshot: snapshotOf({ status: 'unavailable' }) });
  check('an entry the Host does not serve is reported, not blank', () => {
    assert.ok(text(tree).includes('Host 当前没有提供本插件条目'));
  });
}

{
  const { tree } = draw({ snapshot: snapshotOf({ status: 'loading' }) });
  check('the first read renders a loading line only', () => {
    assert.ok(text(tree).includes('正在读取配置…'));
    assert.equal(nodes(tree, 'input').length, 0);
  });
}

{
  const { tree } = draw({ face: faceOf({ namespaces: [] }), snapshot: snapshotOf({ status: 'unavailable' }) });
  check('an entry absent from the describe directory reports unavailable', () => {
    assert.ok(text(tree).includes('无法配置'));
  });
}

// ---- failure and disabled states ----------------------------------------
{
  const { tree } = draw({ snapshot: snapshotOf({ value: { lastSyncError: 'HTTP 401 Unauthorized', lastSyncSummary: '' } }) });
  check('the last failure is surfaced in the status panel', () => {
    assert.ok(text(tree).includes('错误: HTTP 401 Unauthorized'));
  });
}

{
  const { tree } = draw({ snapshot: snapshotOf({ value: { enabled: false, baseUrl: '' } }) });
  check('a disabled plugin warns about both switches', () => {
    const body = text(tree);
    assert.ok(body.includes('自动同步已关闭'));
    assert.ok(body.includes('尚未填写接口地址'));
  });
}

{
  const { tree } = draw({ face: faceOf({ secretSet: false }) });
  check('an unconfigured key offers no clear action', () => {
    const body = text(tree);
    assert.ok(body.includes('未配置密钥'));
    assert.equal(nodes(tree, 'button', '清除密钥').length, 0);
    const secret = nodes(tree, 'input').find((n) => n.props.type === 'password');
    assert.equal(secret.props.placeholder, 'sk-…');
  });
}

// ---- english copy --------------------------------------------------------
{
  const { tree } = draw({ locale: 'en' });
  check('the same page renders in English', () => {
    const body = text(tree);
    assert.ok(body.includes('Sync configuration'));
    assert.ok(body.includes('Base URL'));
    assert.ok(body.includes('Key configured'));
    const secret = nodes(tree, 'input').find((n) => n.props.type === 'password');
    assert.equal(secret.props.placeholder, 'Keep current');
    assert.equal(nodes(tree, 'button', 'Save', true).length, 1);
    assert.equal(nodes(tree, 'button', 'Sync now', true).length, 1);
  });
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
