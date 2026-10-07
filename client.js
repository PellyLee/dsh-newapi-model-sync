window.__ModuleLoader__.load({
  id: 'dsh-newapi-model-sync',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'dsh-newapi-model-sync';
    /** Settings namespace = the Loader entry id, exactly as `cordis.patch.yml` spells it. */
    const ENTRY = 'newapi-model-sync';
    /** Settings namespace of the llm route entry whose model list this plugin mirrors. */
    const LLM_NS = 'llm-pi-ai';
    /** Config path of the credential; declared `role('secret')` host-side, so its literal
     * never rides a settings read — only `secrets: [{ path, set }]` reaches the browser. */
    const SECRET = 'apiKey';
    /** Volatile trigger field a manual sync bumps; written directly, never staged. */
    const TRIGGER = 'syncRequestAt';

    const DICT = {
      zh: {
        nav: 'New API 同步',
        title: 'New API 模型同步',
        desc: '定时拉取 New API 实例的模型列表，覆盖写入 llm-pi-ai 的 provider 路由。',
        config: '同步配置',
        status: '同步状态',
        enabled: '启用自动同步',
        enabledHint: '关闭后定时器停止，「立即同步」也不会执行。',
        baseUrl: '接口地址',
        baseUrlHint: 'New API 的 OpenAI 兼容根地址，通常以 /v1 结尾；同步时自动追加 /models。',
        apiKey: 'API 密钥',
        apiKeyHintSet: '该密钥只用于读取模型列表。留空表示保持不变；输入新值并保存即可替换。',
        apiKeyHintUnset: '尚未配置。填入该实例的 sk- 令牌后保存。',
        apiKeyKeep: '保持不变',
        apiKeyClear: '清除密钥',
        apiKeySetBadge: '已配置密钥',
        apiKeyUnsetBadge: '未配置密钥',
        providerName: 'Provider 路由名',
        providerNameHint: 'llm-pi-ai 中被覆盖写入模型列表的那条 provider。',
        intervalMinutes: '同步周期（分钟）',
        intervalHint: '最小 1 分钟；保存后立即生效，无需重启。',
        excludePatterns: '排除规则（每行一条正则）',
        excludeHint: '模型 id 命中任意一条即被过滤，大小写不敏感。',
        excludeCount: '当前 {n} 条规则',
        preserveCustomFields: '保留模型自定义字段',
        preserveHint: '同 id 的模型沿用原有的 contextWindow 等字段，只增删列表项。',
        debugFile: '调试日志路径（可选）',
        debugHint: '把同步过程写入该文本文件；留空表示关闭。',
        lastSync: '上次同步',
        never: '从未同步',
        summary: '结果',
        error: '错误',
        models: '已同步模型数',
        syncNow: '立即同步',
        syncing: '正在同步…',
        timeoutHint: '同步已触发，但等待结果超时，请稍后刷新查看。',
        writeFailed: '写入未被接受，请重试。',
        hintCmd: '也可以在对话框输入 /newapi-sync 手动触发。',
        loading: '正在读取配置…',
        readOnly: '当前部署的设置为只读，无法在此修改。',
        memoryMode: '本页面未连接到本机 Host，改动只留在本次会话，不会落盘。',
        unavailable: 'Host 当前没有提供本插件条目，无法配置（id 应为 newapi-model-sync）。',
        offWarn: '自动同步已关闭，定时任务与「立即同步」都不会执行。',
        urlWarn: '尚未填写接口地址，同步会失败。',
        modified: '已修改 {n} 项',
        save: '保存',
        saving: '保存中…',
        discard: '放弃修改',
        saved: '已保存',
        saveFailed: '本次部署没有接受这些值，已保留供你修改。',
        reset: '恢复默认',
        overridden: '已覆盖',
        reverted: '将恢复默认',
        errRequired: '不能为空。',
        errUrl: '请填写 http:// 或 https:// 开头的地址。',
        errNumber: '请填写不小于 1 的整数。',
        errRegex: '第 {line} 行不是合法正则：{msg}',
      },
      en: {
        nav: 'New API Sync',
        title: 'New API Model Sync',
        desc: 'Polls the model list of a New API instance and mirrors it into the llm-pi-ai provider route.',
        config: 'Sync configuration',
        status: 'Sync status',
        enabled: 'Enable automatic sync',
        enabledHint: 'While off, the scheduler stops and Sync now refuses to run.',
        baseUrl: 'Base URL',
        baseUrlHint: 'OpenAI-compatible root of the New API instance, usually ending in /v1. /models is appended.',
        apiKey: 'API key',
        apiKeyHintSet: 'Used only to read the model list. Leave blank to keep it; type a new value and save to replace it.',
        apiKeyHintUnset: 'Not configured. Paste the sk- token for this instance and save.',
        apiKeyKeep: 'Keep current',
        apiKeyClear: 'Clear key',
        apiKeySetBadge: 'Key configured',
        apiKeyUnsetBadge: 'No key',
        providerName: 'Provider route',
        providerNameHint: 'The provider inside llm-pi-ai whose model list is overwritten.',
        intervalMinutes: 'Sync interval (minutes)',
        intervalHint: 'Minimum 1; takes effect on save, no restart needed.',
        excludePatterns: 'Exclude patterns (one regex per line)',
        excludeHint: 'A model id matching any pattern is filtered out; case-insensitive.',
        excludeCount: '{n} rules active',
        preserveCustomFields: 'Keep per-model custom fields',
        preserveHint: 'Models with the same id keep contextWindow and friends; only list membership changes.',
        debugFile: 'Debug log path (optional)',
        debugHint: 'Appends the sync trace to this file; blank disables it.',
        lastSync: 'Last sync',
        never: 'Never synced',
        summary: 'Result',
        error: 'Error',
        models: 'Synced models',
        syncNow: 'Sync now',
        syncing: 'Syncing…',
        timeoutHint: 'Sync was triggered but waiting timed out; refresh later to see the result.',
        writeFailed: 'The write was not accepted; please retry.',
        hintCmd: 'You can also run /newapi-sync in the composer.',
        loading: 'Loading settings…',
        readOnly: 'This deployment stores settings read-only.',
        memoryMode: 'This page is not bound to a local Host, so edits stay in the session and are never persisted.',
        unavailable: 'The Host is not serving this plugin entry, so it cannot be configured (the id should be newapi-model-sync).',
        offWarn: 'Automatic sync is off; neither the schedule nor Sync now will run.',
        urlWarn: 'No base URL yet, so a sync would fail.',
        modified: '{n} field(s) changed',
        save: 'Save',
        saving: 'Saving…',
        discard: 'Discard',
        saved: 'Saved',
        saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
        reset: 'Reset to default',
        overridden: 'Overridden',
        reverted: 'will revert',
        errRequired: 'Must not be empty.',
        errUrl: 'Enter a URL starting with http:// or https://.',
        errNumber: 'Enter an integer of at least 1.',
        errRegex: 'Line {line} is not a valid regular expression: {msg}',
      },
    };

    // ---- styling: theme tokens only --------------------------------------
    const S = {
      card: { display: 'grid', gap: 16, padding: 16, maxWidth: 760 },
      head: { display: 'grid', gap: 4 },
      title: { fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      caption: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' },
      panel: {
        display: 'grid', gap: 12, padding: 14,
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10,
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      panelTitle: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
      field: { display: 'grid', gap: 5 },
      label: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' },
      hint: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' },
      text: {
        boxSizing: 'border-box', width: '100%', padding: '6px 9px', fontSize: 13,
        fontFamily: 'inherit', borderRadius: 8, outline: 'none',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)',
      },
      area: {
        boxSizing: 'border-box', width: '100%', padding: '6px 9px', fontSize: 12,
        fontFamily: 'monospace', lineHeight: 1.5, minHeight: 92, resize: 'vertical',
        borderRadius: 8, outline: 'none',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)',
      },
      inline: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
      row: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' },
      badge: {
        fontSize: 11, padding: '1px 7px', borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-secondary)',
      },
      badgeOk: {
        fontSize: 11, padding: '1px 7px', borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-state-success-primary)',
      },
      err: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' },
      warn: { fontSize: 12, color: 'var(--dsw-alias-state-warn-primary)' },
      btn: {
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px',
        fontSize: 13, borderRadius: 8, cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-label-primary)',
      },
      btnPrimary: {
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px',
        fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid transparent',
        background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-state-business-primary))',
        color: 'var(--dsw-alias-label-primary-inverted)',
      },
      btnLink: {
        padding: '1px 5px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
        border: '1px solid transparent', background: 'transparent', color: 'var(--dsw-alias-link)',
      },
      off: { opacity: 0.5, cursor: 'not-allowed' },
      switchRow: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
      note: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      invalid: { border: '1px solid var(--dsw-alias-state-error-primary)' },
    };

    /** Every editable Config field of this plugin, in display order. */
    const FIELDS = [
      { key: 'enabled', kind: 'switch', label: 'enabled', hint: 'enabledHint' },
      { key: 'baseUrl', kind: 'text', label: 'baseUrl', hint: 'baseUrlHint', placeholder: 'https://newapi.example.com/v1', required: true, url: true },
      { key: SECRET, kind: 'secret', label: 'apiKey' },
      { key: 'providerName', kind: 'text', label: 'providerName', hint: 'providerNameHint', placeholder: 'newapi', required: true },
      { key: 'intervalMinutes', kind: 'number', label: 'intervalMinutes', hint: 'intervalHint', placeholder: '10' },
      { key: 'excludePatterns', kind: 'lines', label: 'excludePatterns', hint: 'excludeHint' },
      { key: 'preserveCustomFields', kind: 'switch', label: 'preserveCustomFields', hint: 'preserveHint' },
      { key: 'debugFile', kind: 'text', label: 'debugFile', hint: 'debugHint', placeholder: '' },
    ];

    /** Serialize one Host value into its editor text. */
    function toText(field, value) {
      if (value === undefined || value === null) return '';
      if (field.kind === 'lines') return Array.isArray(value) ? value.join('\n') : String(value);
      return String(value);
    }

    /** Parse editor text into the JSON value written to the Host. */
    function toValue(field, text) {
      if (field.kind === 'lines') return String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (field.kind === 'number') return Math.floor(Number(text));
      if (field.kind === 'text') return String(text).trim();
      return text;
    }

    /** Validate one staged text; returns a message or null. */
    function errorOf(field, text, t) {
      if (field.kind === 'number') {
        const n = Number(text);
        if (!Number.isFinite(n) || n < 1 || Math.floor(n) !== n) return t('errNumber');
        return null;
      }
      if (field.kind === 'lines') {
        const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i += 1) {
          try { new RegExp(lines[i], 'i'); } catch (e) {
            return t('errRegex', { line: i + 1, msg: String((e && e.message) || e) });
          }
        }
        return null;
      }
      if (field.kind === 'text') {
        const raw = String(text).trim();
        if (!raw) return field.key === 'debugFile' ? null : t('errRequired');
        if (field.url && /\s/.test(raw)) return t('errUrl');
        if (field.url && !/^https?:\/\//i.test(raw)) return t('errUrl');
        return null;
      }
      return null;
    }

    /** One plugin settings page: live values over the shared settings mirror, staged
     * edits, and a single atomic save through `ctx.configForms`. */
    function Page(props) {
      const { ctx, t, form, mirror } = props;
      // The controller methods are prototype methods, so bind them for
      // useSyncExternalStore rather than handing over the unbound reference.
      const snap = React.useSyncExternalStore(
        React.useCallback((listener) => form.subscribe(listener), [form]),
        React.useCallback(() => form.getSnapshot(), [form]),
      );
      const face = React.useSyncExternalStore(
        React.useCallback((listener) => mirror.subscribe(listener), [mirror]),
        React.useCallback(() => mirror.getSnapshot(), [mirror]),
      );

      const [draft, setDraft] = React.useState({});
      const [keyText, setKeyText] = React.useState('');
      const [saving, setSaving] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [note, setNote] = React.useState('');
      const pollRef = React.useRef(null);
      const noteRef = React.useRef(null);

      React.useEffect(() => () => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (noteRef.current) clearTimeout(noteRef.current);
      }, []);

      const document = face.status === 'ready' ? face.view : undefined;
      const row = document?.namespaces?.find((x) => x.ns === ENTRY);
      const llmRow = document?.namespaces?.find((x) => x.ns === LLM_NS);
      const secretSlot = (row?.secrets || []).find((s) => s.path.join('.') === SECRET);
      const apiKeySet = !!(secretSlot && secretSlot.set);

      const value = snap.value || {};
      const ready = snap.status === 'ready';
      const writable = ready && snap.writable;

      const flash = (message) => {
        setNote(message);
        if (noteRef.current) clearTimeout(noteRef.current);
        noteRef.current = setTimeout(() => { setNote(''); noteRef.current = null; }, 5000);
      };

      /** Effective editor text for one field: staged draft, else Host value. */
      const textOf = (field) => {
        const change = draft[field.key];
        if (!change) return toText(field, value[field.key]);
        if (change.op === 'unset') return toText(field, row?.base?.[field.key]);
        return change.text;
      };

      const editText = (field, text) => {
        setDraft((current) => ({ ...current, [field.key]: { op: 'set', text } }));
      };

      const revert = (key) => setDraft((current) => ({ ...current, [key]: { op: 'unset' } }));

      const discard = () => { setDraft({}); setKeyText(''); };

      const errors = {};
      for (const field of FIELDS) {
        const change = draft[field.key];
        if (!change || change.op === 'unset' || field.kind === 'secret') continue;
        const message = errorOf(field, change.text, t);
        if (message) errors[field.key] = message;
      }
      if (draft[SECRET] && draft[SECRET].op === 'set' && !String(draft[SECRET].text || '').trim()) {
        errors[SECRET] = t('errRequired');
      }
      const errorList = Object.keys(errors);

      const save = async () => {
        if (!writable || errorList.length) return;
        const ops = [];
        for (const field of FIELDS) {
          const change = draft[field.key];
          if (!change) continue;
          if (change.op === 'unset') { ops.push({ op: 'unset', path: [field.key] }); continue; }
          if (field.kind === 'secret') {
            const literal = String(change.text || '').trim();
            if (literal) ops.push({ op: 'set', path: [field.key], value: literal });
            continue;
          }
          ops.push({ op: 'set', path: [field.key], value: toValue(field, change.text) });
        }
        if (!ops.length) { discard(); return; }
        setSaving(true);
        let ok = false;
        let failure = '';
        try {
          // One atomic mutation: shared revision fence, Host validation, and
          // recovery read; the mirror folds the answer back in.
          ok = await form.mutate(ops);
        } catch (e) {
          failure = String((e && e.message) || e);
        }
        setSaving(false);
        if (ok) { discard(); flash(t('saved')); } else flash(failure || t('saveFailed'));
      };

      /** Host sync status is written by the plugin, not by this page, so the shared
       * mirror cannot be pushed at that moment; a bounded describe poll forces the
       * refresh (and the host read also invalidates the mirror for every other page). */
      const waitForSync = (trigger) => {
        let waited = 0;
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          waited += 2000;
          try {
            const res = await ctx.remote.settings.describe();
            const held = res && res.ok && (res.value.namespaces || []).find((x) => x.ns === ENTRY);
            if (held && held.value && Number(held.value.lastSyncAt) >= trigger) {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setBusy(false);
              setNote('');
              return;
            }
          } catch (e) { /* keep waiting until the deadline */ }
          if (waited >= 120_000) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setBusy(false);
            flash(t('timeoutHint'));
          }
        }, 2000);
      };

      const syncNow = async () => {
        if (!writable) { flash(t(snap.mode === 'memory' ? 'memoryMode' : 'readOnly')); return; }
        setNote('');
        setBusy(true);
        const trigger = Date.now();
        let ok = false;
        let failure = '';
        try {
          ok = await form.set(TRIGGER, trigger);
        } catch (e) {
          failure = String((e && e.message) || e);
        }
        if (!ok) {
          setBusy(false);
          flash(failure || t('writeFailed'));
          return;
        }
        waitForSync(trigger);
      };

      const control = (field) => {
        const change = draft[field.key];
        if (field.kind === 'switch') {
          const on = change ? (change.op === 'unset' ? !!row?.base?.[field.key] : change.text === true) : !!value[field.key];
          return h('label', { style: S.switchRow },
            h('input', {
              type: 'checkbox', checked: on, disabled: !writable,
              style: { width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--dsw-alias-state-business-primary)' },
              onChange: (e) => setDraft((current) => ({ ...current, [field.key]: { op: 'set', text: e.target.checked } })),
            }),
            h('span', { style: S.label }, t(field.label)));
        }
        if (field.kind === 'secret') {
          return h('div', { style: S.field },
            h('div', { style: S.inline },
              h('span', { style: S.label }, t('apiKey')),
              apiKeySet ? h('span', { style: S.badgeOk }, t('apiKeySetBadge')) : h('span', { style: S.badge }, t('apiKeyUnsetBadge'))),
            h('input', {
              style: { ...S.text, ...(errors[SECRET] ? S.invalid : {}) },
              type: 'password', value: keyText, disabled: !writable,
              autoComplete: 'off', spellCheck: false,
              placeholder: apiKeySet ? t('apiKeyKeep') : 'sk-…',
              onChange: (e) => {
                const text = e.target.value;
                setKeyText(text);
                setDraft((current) => {
                  const next = { ...current };
                  if (text) next[SECRET] = { op: 'set', text };
                  else delete next[SECRET];
                  return next;
                });
              },
            }),
            h('div', { style: S.hint }, t(apiKeySet ? 'apiKeyHintSet' : 'apiKeyHintUnset')),
            apiKeySet && writable ? h('div', { style: S.inline },
              '⊘', h('button', { type: 'button', style: S.btnLink, onClick: () => { setKeyText(''); setDraft((c) => ({ ...c, [SECRET]: { op: 'unset' } })); } }, t('apiKeyClear'))) : null,
            draft[SECRET] && draft[SECRET].op === 'unset' ? h('span', { style: S.badge }, t('reverted')) : null,
            errors[SECRET] ? h('div', { style: S.err }, errors[SECRET]) : null);
        }
        const text = textOf(field);
        const invalid = !!errors[field.key];
        const style = { ...(field.kind === 'lines' ? S.area : S.text), ...(invalid ? S.invalid : {}) };
        if (field.kind === 'lines') {
          return h('textarea', {
            style, value: text, disabled: !writable, spellCheck: false,
            placeholder: '^@cf/\nembedding',
            onChange: (e) => editText(field, e.target.value),
          });
        }
        return h('input', {
          style, value: text, disabled: !writable,
          type: field.kind === 'number' ? 'number' : 'text',
          min: field.kind === 'number' ? 1 : undefined,
          step: field.kind === 'number' ? 1 : undefined,
          spellCheck: false, autoComplete: 'off',
          placeholder: field.placeholder || '',
          onChange: (e) => editText(field, e.target.value),
        });
      };

      const fieldBlock = (field) => {
        if (field.kind === 'secret') return control(field);
        const change = draft[field.key];
        const overridden = !!row && row.user && row.user[field.key] !== undefined;
        const isRevert = !!change && change.op === 'unset';
        return h('div', { style: S.field, key: field.key },
          h('div', { style: S.inline },
            h('span', { style: S.label }, t(field.label)),
            isRevert ? h('span', { style: S.badge }, t('reverted'))
              : overridden ? h('span', { style: S.badge }, t('overridden')) : null,
            writable && overridden && !isRevert ? h('button', {
              type: 'button', style: S.btnLink, onClick: () => revert(field.key),
            }, t('reset')) : null),
          control(field),
          errors[field.key] ? h('div', { style: S.err }, errors[field.key]) : null,
          field.hint ? h('div', { style: S.hint }, t(field.hint)) : null,
          field.kind === 'lines'
            ? h('div', { style: S.hint }, t('excludeCount', { n: toValue(field, textOf(field)).length }))
            : null);
      };

      if (!ready && snap.status === 'loading') {
        return h('div', { style: S.card },
          h('div', { style: S.head }, h('div', { style: S.title }, t('title'))),
          h('div', { style: S.caption }, t('loading')));
      }
      if (snap.status === 'unavailable') {
        return h('div', { style: S.card },
          h('div', { style: S.head }, h('div', { style: S.title }, t('title'))),
          h('div', { style: S.err }, t('unavailable')));
      }

      const lastAt = Number(value.lastSyncAt) || 0;
      const routeName = String(value.providerName || 'newapi');
      const route = (llmRow?.value?.providers || {})[routeName];
      const modelCount = route && Array.isArray(route.models) ? route.models.length : null;
      const changedCount = Object.keys(draft).length;
      const dirty = changedCount > 0;

      return h('div', { style: S.card },
        h('div', { style: S.head },
          h('div', { style: S.title }, t('title')),
          h('div', { style: S.caption }, t('desc'))),

        h('div', { style: S.panel },
          h('div', { style: S.panelTitle }, t('status')),
          h('div', { style: S.row }, `${t('lastSync')}: ${lastAt ? new Date(lastAt).toLocaleString() : t('never')}`),
          value.lastSyncError
            ? h('div', { style: S.err }, `${t('error')}: ${value.lastSyncError}`)
            : (value.lastSyncSummary ? h('div', { style: S.row }, `${t('summary')}: ${value.lastSyncSummary}`) : null),
          modelCount === null ? null : h('div', { style: S.row }, `${t('models')}: ${modelCount}`),
          h('div', { style: S.inline },
            h('button', {
              type: 'button', style: { ...S.btnPrimary, ...(busy || !writable ? S.off : {}) },
              disabled: busy || !writable, onClick: () => void syncNow(),
            }, busy ? t('syncing') : t('syncNow')),
            note ? h('span', { style: S.note }, note) : null),
          h('div', { style: S.caption }, t('hintCmd'))),

        h('div', { style: S.panel },
          h('div', { style: S.panelTitle }, t('config')),
          !writable ? h('div', { style: S.warn }, t(snap.mode === 'memory' ? 'memoryMode' : 'readOnly')) : null,
          value.enabled === false ? h('div', { style: S.warn }, t('offWarn')) : null,
          !value.baseUrl ? h('div', { style: S.warn }, t('urlWarn')) : null,
          FIELDS.map(fieldBlock),
          h('div', { style: S.inline },
            h('button', {
              type: 'button',
              style: { ...S.btnPrimary, ...(!dirty || saving || errorList.length || !writable ? S.off : {}) },
              disabled: !dirty || saving || errorList.length > 0 || !writable,
              onClick: () => void save(),
            }, saving ? t('saving') : t('save')),
            dirty ? h('button', { type: 'button', style: S.btn, onClick: discard }, t('discard')) : null,
            dirty ? h('span', { style: S.note }, t('modified', { n: changedCount })) : null),
          errorList.length ? h('div', { style: S.err }, errorList.map((k) => errors[k]).join(' ')) : null));
    }

    return {
      // `configForms` is the settings domain's public face: values read from the
      // shared describe mirror, writes go through one revision-fenced, atomic
      // mutation queue. `remote.settings` must be injected by name (not merely
      // `remote`) — the generated remote namespace registers as its own service
      // key, so touching it without the entry throws "cannot get property
      // \"remote.settings\" without inject". It is also what the bounded sync
      // refresh poll below reads.
      inject: ['slots', 'locale', 'remote', 'remote.settings', 'configForms'],
      apply(ctx) {
        ctx.locale.register(NS, DICT);
        const t = ctx.locale.bind(NS);
        const form = ctx.configForms.get(ENTRY);
        const mirror = ctx.configForms.describe();
        return ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: ENTRY,
          order: 18,
          label: () => t('nav'),
          locale: NS,
        }, () => h(Page, { ctx, t, form, mirror })));
      },
    };
  },
});
