// Audit: every dictionary key is referenced by the page, and zh/en cover the same set.
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');

/** The page body, with the dictionary itself removed, as the reference search space. */
const body = (() => {
  const start = src.indexOf('const DICT = {');
  const end = src.indexOf('\n    };', start);
  if (start < 0 || end < 0) throw new Error('could not locate the DICT block');
  return src.slice(0, start) + src.slice(end);
})();

/** A key is referenced when it appears as a quoted literal in the page body — either directly
 * (`t('saved')`), inside a conditional (`t(ok ? 'saved' : 'saveFailed')`), or as the `label`
 * / `hint` of the field table, which the block renders through `t(field.label)`. */
const referenced = (key) => body.includes(`'${key}'`);
const unreferenced = (dict) => Object.keys(dict).filter((k) => !referenced(k));
const missing = () => {
  const keys = [...body.matchAll(/\bt\('([a-zA-Z]+)'/g)].map((m) => m[1]);
  return [...new Set(keys)].filter((k) => !(k in dicts['dsh-newapi-model-sync'].zh) || !(k in dicts['dsh-newapi-model-sync'].en));
};

let mod;
const window = { __ModuleLoader__: { load: (m) => { mod = m; } } };
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (init) => [init, () => {}],
  useRef: () => ({ current: null }),
  useEffect: () => {},
  useCallback: (fn) => fn,
  useSyncExternalStore: (sub, get) => get(),
};
const dicts = {};
const noop = () => {};
const ctx = {
  locale: {
    register: (ns, dict) => { dicts[ns] = dict; },
    bind: () => (key) => String(key),
  },
  configForms: { get: () => ({}), describe: () => ({}) },
  slots: {
    inject: (name, build) => { build(); return noop; },
    register: (options, component) => { component(); return noop; },
  },
  remote: { settings: { describe: async () => ({ ok: true, value: { namespaces: [] } }) } },
};
new Function('window', src)(window);
mod.factory(() => React).apply(ctx);

const zh = dicts['dsh-newapi-model-sync'].zh;
const en = dicts['dsh-newapi-model-sync'].en;
const zhKeys = Object.keys(zh);
const enKeys = Object.keys(en);
const deadZh = unreferenced(zh);
const deadEn = unreferenced(en);
const gap = missing();

console.log(`dictionary keys: ${zhKeys.length} (zh) / ${enKeys.length} (en)`);
console.log(`direct t() calls with no entry: ${gap.join(', ') || '-'}`);
console.log(`unreferenced in zh: ${deadZh.join(', ') || '-'}`);
console.log(`unreferenced in en: ${deadEn.join(', ') || '-'}`);
const asym = [...zhKeys.filter((k) => !enKeys.includes(k)), ...enKeys.filter((k) => !zhKeys.includes(k))];
console.log(`zh/en parity: ${asym.length ? `MISMATCH ${asym.join(',')}` : 'OK'}`);
process.exitCode = gap.length || asym.length || deadZh.length || deadEn.length ? 1 : 0;
if (process.exitCode) console.log('\nFAIL: missing keys, an asymmetric dictionary, or dead copy.');
else console.log('\nOK: every key is referenced by the page, both languages cover it, nothing is dead copy.');
