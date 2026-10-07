/**
 * Host-half contract test for `index.js`, plus the cross-file check that the
 * browser page only offers fields the Host schema actually declares.
 *
 * It imports the real Config schema, so it fails if a field loses `volatile()`
 * (a settings write would then remount the plugin), if the credential loses
 * `role('secret')` (its literal would then ride every `settings.describe` read
 * to the browser), or if the two halves drift apart.
 *
 * Run: node test/host-config.mjs   (or: npm test)
 * @module test/host-config
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
async function check(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${label}\n    ${String(e && e.message ? e.message : e).split('\n').slice(0, 4).join('\n    ')}`);
  }
}

const plugin = await import(path.join(root, 'index.js'));
const { Config, name, inject } = plugin;

/** Field keys the browser page renders, read straight out of `client.js`. */
function clientFields() {
  const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
  const block = source.slice(source.indexOf('const FIELDS = ['));
  const body = block.slice(0, block.indexOf('];'));
  return [...body.matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
}

console.log('index.js — host contract checks\n');

await check('exports the Loader entry id and its required services', () => {
  assert.equal(name, 'newapi-model-sync');
  for (const service of ['timer', 'commands', 'configEditor', 'hmr']) {
    assert.ok(inject.includes(service), `inject is missing ${service}`);
  }
});

await check('every field the page edits is declared, and declared volatile', () => {
  const fields = clientFields();
  assert.ok(fields.length >= 7, `suspiciously few editable fields parsed: ${fields.join(',')}`);
  for (const key of fields) {
    const field = Config.dict[key];
    assert.ok(field, `Config has no field "${key}" the page edits`);
    assert.equal(field.meta.volatile, true, `Config.${key} is not volatile; a write would remount the plugin`);
  }
});

await check('the credential is a schema-declared secret', () => {
  assert.equal(Config.dict.apiKey.meta.role, 'secret', 'apiKey must keep role(\'secret\') or its literal leaves the Host on every read');
});

await check('the trigger and the host-written status are hidden from generated forms', () => {
  for (const key of ['syncRequestAt', 'lastSyncAt', 'lastSyncSummary', 'lastSyncError']) {
    assert.equal(Config.dict[key].meta.hidden, true, `${key} should be .hidden()`);
    assert.equal(Config.dict[key].meta.volatile, true, `${key} must stay volatile to reach the browser at all`);
  }
});

await check('nothing sensitive is required to boot: defaults are inert', () => {
  assert.equal(Config.dict.baseUrl.meta.default, '');
  assert.equal(Config.dict.apiKey.meta.default, '');
  assert.equal(Config.dict.enabled.meta.default, true);
  assert.equal(Config.dict.intervalMinutes.meta.default, 10);
});

await check('the shipped exclusion defaults filter the obvious non-chat ids', () => {
  const patterns = Config.dict.excludePatterns.meta.default;
  assert.ok(Array.isArray(patterns) && patterns.length > 10, 'excludePatterns default should be a populated list');
  const re = (id) => patterns.some((p) => new RegExp(p, 'i').test(id));
  assert.ok(re('bge-large-zh-v1.5'), 'an embedding model should be excluded');
  assert.ok(re('aura-1-h'), 'an image model should be excluded');
  assert.ok(!re('deepseek-chat'), 'a chat model must survive the default filters');
  assert.ok(!re('qwen3.8-flash'), 'a chat model must survive the default filters');
});

await check('every default exclusion pattern compiles', () => {
  for (const p of Config.dict.excludePatterns.meta.default) {
    new RegExp(p, 'i');
  }
});

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
