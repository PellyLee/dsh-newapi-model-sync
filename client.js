window.__ModuleLoader__.load({
  id: 'dsh-newapi-model-sync',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-newapi-model-sync';
    /** Own settings namespace: the Loader entry id, exactly as `cordis.patch.yml` spells it. */
    const ENTRY = 'newapi-model-sync';
    /** Settings namespace of the llm route entry this plugin writes into. */
    const LLM_NS = 'llm-pi-ai';
    const DICT = {
      zh: {
        nav: 'New API 同步',
        title: 'New API 模型同步',
        desc: '定时从 New API 实例拉取模型列表，覆盖写入 llm-pi-ai 的 provider 路由。地址、密钥、周期与开关在本插件 profile patch 条目的 config 中修改（见 README）。',
        lastSync: '上次同步',
        never: '从未同步',
        summary: '结果',
        error: '错误',
        current: '当前同步的模型数',
        syncNow: '立即同步',
        syncing: '正在同步…',
        timeoutHint: '同步已触发，但等待结果超时，请稍后刷新查看。',
        writeFailed: '触发写入失败',
        missing: '未在配置命名空间中找到本插件条目（id 可能被改动，应为 newapi-model-sync）',
        conflictHint: '配置已被其他窗口修改，已重新读取，请再点一次「立即同步」。',
        hintCmd: '也可以在对话框输入 /newapi-sync 手动触发。',
        loading: '正在读取配置…',
        failed: '读取设置失败',
        retry: '重试',
      },
      en: {
        nav: 'New API Sync',
        title: 'New API Model Sync',
        desc: 'Polls the model list of a New API instance and mirrors it into the llm-pi-ai provider route. Edit base URL, key, period and the switch in this plugin\'s `config:` block in the profile patch (see README).',
        lastSync: 'Last sync',
        never: 'Never synced',
        summary: 'Result',
        error: 'Error',
        current: 'Synced model count',
        syncNow: 'Sync now',
        syncing: 'Syncing…',
        timeoutHint: 'Sync was triggered but waiting timed out; refresh later to see the result.',
        writeFailed: 'Failed to write the trigger',
        missing: 'This plugin has no settings namespace (the entry id should be newapi-model-sync)',
        conflictHint: 'Settings changed in another window; reloaded, click Sync now again.',
        hintCmd: 'You can also run /newapi-sync in the composer.',
        loading: 'Loading settings…',
        failed: 'Could not read settings',
        retry: 'Retry',
      },
    };

    const card = {
      display: 'grid', gap: 14, padding: 16, maxWidth: 720,
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: 10,
      background: 'var(--dsw-alias-bg-layer-1)',
      color: 'var(--dsw-alias-label-primary)',
    };
    const titleStyle = { fontSize: 15, fontWeight: 600 };
    const caption = { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' };
    const row = { fontSize: 13 };
    const btn = {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'var(--dsw-alias-bg-layer-3)',
      color: 'var(--dsw-alias-label-primary)',
    };
    const btnPrimary = { ...btn, background: 'var(--dsw-alias-state-business-primary)', color: '#fff', borderColor: 'transparent' };
    const err = { fontSize: 13, color: 'var(--dsw-alias-state-error-primary)' };

    /** Namespace rows of one describe() payload: { writable, hasDocument, namespaces: [...] }. */
    const rowsOf = (value) => (value && Array.isArray(value.namespaces) ? value.namespaces : []);

    function Section({ ctx, t }) {
      const [state, setState] = React.useState({ loading: true });
      const [busy, setBusy] = React.useState(false);
      const [note, setNote] = React.useState('');
      const pollRef = React.useRef(null);
      React.useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

      const refresh = React.useCallback(async () => {
        try {
          const r = await ctx.remote.settings.describe();
          if (!r || !r.ok) {
            setState({ loading: false, error: (r && r.error && r.error.message) || t('failed') });
            return;
          }
          const rows = rowsOf(r.value);
          const desc = rows.find((x) => x.ns === ENTRY);
          const llm = rows.find((x) => x.ns === LLM_NS);
          setState({ loading: false, desc, llm, error: desc ? '' : t('missing') });
        } catch (e) {
          setState({ loading: false, error: String((e && e.message) || e) });
        }
      }, [ctx, t]);

      React.useEffect(() => { void refresh(); }, [refresh]);

      const syncNow = async () => {
        setNote('');
        if (!state.desc) { void refresh(); return; }
        setBusy(true);
        setNote(t('syncing'));
        const trigger = Date.now();
        try {
          const r = await ctx.remote.settings.mutate(
            ENTRY,
            [{ op: 'set', path: ['syncRequestAt'], value: trigger }],
            state.desc.revision,
          );
          if (!r || !r.ok) {
            const code = r && r.error && r.error.code;
            if (code === 'settings/conflict') {
              setBusy(false);
              setNote(t('conflictHint'));
              void refresh();
              return;
            }
            setBusy(false);
            setNote(`${t('writeFailed')}: ${String((r && r.error && r.error.message) || '')}`);
            return;
          }
          let waited = 0;
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = setInterval(async () => {
            waited += 2500;
            try {
              const rr = await ctx.remote.settings.describe();
              const d = rr && rr.ok && rowsOf(rr.value).find((x) => x.ns === ENTRY);
              if (d && d.value && Number(d.value.lastSyncAt) >= trigger) {
                clearInterval(pollRef.current);
                pollRef.current = null;
                setBusy(false);
                setNote('');
                void refresh();
                return;
              }
            } catch (e) { /* keep polling until the deadline */ }
            if (waited >= 90_000) {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setBusy(false);
              setNote(t('timeoutHint'));
            }
          }, 2500);
        } catch (e) {
          setBusy(false);
          setNote(String((e && e.message) || e));
        }
      };

      if (state.loading) return h('div', { style: card }, h('div', { style: caption }, t('loading')));
      if (state.error && !state.desc) {
        return h('div', { style: card },
          h('div', { style: err }, `${t('failed')}: ${state.error}`),
          h('button', { style: btn, onClick: () => void refresh() }, t('retry')));
      }
      const v = state.desc.value || {};
      const lastAt = Number(v.lastSyncAt) || 0;
      const fmt = (ts) => new Date(ts).toLocaleString();
      return h('div', { style: card },
        h('div', { style: { display: 'grid', gap: 4 } },
          h('div', { style: titleStyle }, t('title')),
          h('div', { style: caption }, t('desc'))),
        h('div', { style: { display: 'grid', gap: 6 } },
          h('div', { style: row }, `${t('lastSync')}: ${lastAt ? fmt(lastAt) : t('never')}`),
          v.lastSyncError
            ? h('div', { style: err }, `${t('error')}: ${v.lastSyncError}`)
            : (v.lastSyncSummary ? h('div', { style: row }, `${t('summary')}: ${v.lastSyncSummary}`) : null),
          (() => {
            const route = ((state.llm && state.llm.value && state.llm.value.providers) || {})[v.providerName || 'newapi'];
            const n = route && Array.isArray(route.models) ? route.models.length : null;
            return n == null ? null : h('div', { style: row }, `${t('current')}: ${n}`);
          })()),
        h('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
          h('button', { style: btnPrimary, disabled: busy, onClick: () => void syncNow() }, busy ? t('syncing') : t('syncNow')),
          note ? h('span', { style: caption }, note) : null),
        h('div', { style: caption }, t('hintCmd')));
    }

    return {
      // `remote.<ns>` sub-namespace must be injected by name, not only `remote`:
      // the generated client registers it as its own service key, so reading
      // ctx.remote.settings without it throws "cannot get property
      // \"remote.settings\" without inject".
      inject: ['slots', 'locale', 'remote', 'remote.settings'],
      apply(ctx) {
        ctx.locale.register(NS, DICT);
        const t = ctx.locale.bind(NS);
        return ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: ENTRY,
          order: 18,
          label: () => t('nav'),
          locale: NS,
        }, () => h(Section, { ctx, t })));
      },
    };
  },
});
