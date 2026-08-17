// Vibrant Resonance — main application controller
// Lock screen → user picker → tabs (Generator / Protocols / Brain / Admin)
'use strict';

const App = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  let currentUser = null;   // {id, name}
  let genRaf = 0;
  const genScopeBuf = new Float32Array(4096);

  // ---------- helpers ----------
  function pins() { return Store.setting('pins', { app: '4545', admin: '1212' }); }

  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function fmtHz(hz) {
    return (Math.round(hz * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  function protoTotal(steps) { return steps.reduce((a, s) => a + (Number(s.seconds) || 0), 0); }

  // ---------- lock screen ----------
  let pinBuffer = '';
  function renderDots() {
    $('#lock-dots').innerHTML = [0, 1, 2, 3].map((i) =>
      `<span class="dot ${i < pinBuffer.length ? 'filled' : ''}"></span>`).join('');
  }

  function pressKey(k) {
    if (k === 'back') pinBuffer = pinBuffer.slice(0, -1);
    else if (pinBuffer.length < 4) pinBuffer += k;
    renderDots();
    if (pinBuffer.length === 4) {
      if (pinBuffer === pins().app) {
        pinBuffer = '';
        $('#lock-screen').classList.add('hidden');
        showUserScreen();
      } else {
        const pad = $('#lock-pad-wrap');
        pad.classList.add('shake');
        setTimeout(() => { pad.classList.remove('shake'); pinBuffer = ''; renderDots(); }, 450);
      }
    }
  }

  // ---------- user picker ----------
  function activeUsers() {
    return Store.rows('users').filter((u) => u.active !== 0).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  function showUserScreen() {
    $('#user-screen').classList.remove('hidden');
    renderUserList();
  }

  function renderUserList() {
    const users = activeUsers();
    $('#user-list').innerHTML = users.length
      ? users.map((u) => `<button class="user-card" data-id="${u.id}">${u.name}</button>`).join('')
      : '<p class="muted">No users yet — add the first one below.</p>';
    $$('#user-list .user-card').forEach((b) => b.addEventListener('click', () => {
      const u = Store.get('users', b.dataset.id);
      currentUser = { id: u.id, name: u.name };
      $('#user-screen').classList.add('hidden');
      enterApp();
    }));
  }

  function addUser(name) {
    name = (name || '').trim();
    if (!name) return;
    const exists = activeUsers().find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (exists) { toast(`${name} already exists`); return; }
    Store.upsert('users', { id: undefined, name, active: 1 });
    renderUserList();
    renderAdminUsers();
  }

  // ---------- main app ----------
  function enterApp() {
    $('#main-app').classList.remove('hidden');
    $('#user-chip').textContent = currentUser.name;
    switchTab('generator');
    refresh();
  }

  function switchTab(tab) {
    $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-pane').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + tab));
    if (tab === 'generator') { updateGenInfo(); startGenScope(); } else stopGenScope();
    if (tab === 'protocols') renderPresets();
    if (tab === 'brain') { renderBrainResults($('#brain-q').value); updateChatKeyNotice(); }
    if (tab === 'admin') renderAdminGate();
  }

  function refresh() {
    renderPresets();
    renderAdminSessions();
    renderAdminUsers();
    renderTraining();
    updateSyncBadge();
  }

  function updateSyncBadge() {
    const dot = $('#sync-dot');
    dot.classList.toggle('online', Store.isOnline);
    $('#sync-label').textContent = Store.isOnline
      ? (Store.hasSyncToken ? 'Live · all locations' : 'Synced')
      : 'Local mode';
  }

  // ---------- generator ----------
  let genHz = 728;

  function setGenHz(hz) {
    hz = Math.min(100000, Math.max(0.1, Number(hz) || 0.1));
    genHz = Math.round(hz * 10) / 10;
    $('#gen-freq').value = genHz;
    if (AudioEngine.playing) AudioEngine.setFrequency(genHz);
    updateGenInfo();
  }

  function updateGenInfo() {
    const info = AudioEngine.context ? AudioEngine.info() : null;
    $('#gen-sr').textContent = info ? (info.sampleRate / 1000) + ' kHz' : 'starts on play';
    $('#gen-max').textContent = info ? fmtHz(info.nyquist) + ' Hz' : '—';
    const over = info && genHz > info.nyquist;
    $('#gen-warning').classList.toggle('hidden', !over);
    if (over) {
      $('#gen-warning').textContent =
        `⚠ ${fmtHz(genHz)} Hz is above this device's clean limit of ${fmtHz(info.nyquist)} Hz (sample rate ${info.sampleRate / 1000} kHz). The tone cannot be produced accurately on this hardware.`;
    }
  }

  function toggleGenPlay() {
    if (AudioEngine.playing) {
      AudioEngine.stop();
      $('#gen-play').textContent = '▶ Play';
      $('#gen-play').classList.remove('playing');
    } else {
      AudioEngine.start(genHz);
      $('#gen-play').textContent = '⏹ Stop';
      $('#gen-play').classList.add('playing');
      updateGenInfo();
    }
  }

  function startGenScope() {
    cancelAnimationFrame(genRaf);
    const draw = () => {
      const canvas = $('#gen-scope');
      const ctx2 = canvas.getContext('2d');
      const { width: w, height: h } = canvas;
      ctx2.clearRect(0, 0, w, h);
      if (AudioEngine.playing && AudioEngine.waveform(genScopeBuf)) {
        ctx2.beginPath();
        ctx2.strokeStyle = '#2DD4BF';
        ctx2.lineWidth = 2;
        ctx2.shadowColor = '#2DD4BF';
        ctx2.shadowBlur = 10;
        const sr = AudioEngine.context.sampleRate;
        const samples = Math.min(genScopeBuf.length, Math.max(64, Math.floor((sr / Math.max(1, genHz)) * 4)));
        for (let i = 0; i < samples; i++) {
          const x = (i / samples) * w;
          const y = h / 2 - genScopeBuf[i] * (h / 2.4);
          i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y);
        }
        ctx2.stroke();
        ctx2.shadowBlur = 0;
        const measured = AudioEngine.measuredHz();
        $('#gen-measured').textContent = measured ? fmtHz(measured) + ' Hz' : '—';
      } else {
        // flat line
        ctx2.beginPath();
        ctx2.strokeStyle = 'rgba(255,255,255,.12)';
        ctx2.lineWidth = 1.5;
        ctx2.moveTo(0, h / 2); ctx2.lineTo(w, h / 2);
        ctx2.stroke();
        $('#gen-measured').textContent = '—';
      }
      genRaf = requestAnimationFrame(draw);
    };
    draw();
  }
  function stopGenScope() { cancelAnimationFrame(genRaf); }

  // ---------- presets ----------
  const BUILTIN_PRESETS = [
    { id: 'preset-parasites-4step', name: 'Parasites — Classic 4-Step Cleanup', category: 'Parasites', freqs: [728, 784, 880, 465] },
    { id: 'preset-parasites-6step', name: 'Parasites — Extended 6-Step', category: 'Parasites', freqs: [728, 784, 880, 465, 727, 800] },
    { id: 'preset-mold-core', name: 'Mold & Fungus — General Core', category: 'Mold & Fungus', freqs: [728, 784, 880, 464] },
    { id: 'preset-mold-general', name: 'Mold — General (13-frequency)', category: 'Mold & Fungus', freqs: [222, 242, 523, 565, 592, 623, 745, 933, 1130, 1155, 1333, 1833, 4442] },
    { id: 'preset-aspergillus-master', name: 'Aspergillus — Master Set', category: 'Mold & Fungus', freqs: [1972, 1823, 758, 743, 697, 524, 374, 339, 247] },
    { id: 'preset-rife-classics', name: 'Rife Classics — General Set', category: 'General', freqs: [20, 72, 95, 125, 440, 465, 727, 787, 802, 880, 1550, 5000, 10000] },
    {
      id: 'preset-asthma2-historical', name: 'Asthma — CAFL Asthma_2 (Historical 45 min)', category: 'Respiratory',
      steps: [1234, 3672, 7346, 727, 787, 880, 10000, 47, 120].map((hz) => ({ hz, seconds: 300 })),
    },
    {
      id: 'preset-gamma-frontal', name: 'Frontal Lobe — Gamma 40 Hz (Research Mode)', category: 'Brain & Cognition', favorite: 1,
      steps: [
        { hz: 700, seconds: 600, pulseHz: 40 },
        { hz: 700, seconds: 600, pulseHz: 40 },
        { hz: 700, seconds: 600, pulseHz: 40 },
      ],
    },
    {
      id: 'preset-alzheimers2', name: 'Memory — CAFL Alzheimers_2', category: 'Brain & Cognition',
      steps: [19180.5, 2213, 5148, 866, 840, 624, 620, 430].map((hz) => ({ hz, seconds: 180 })),
    },
    {
      id: 'preset-lymph-support', name: 'Lymphatic Drainage — CAFL Lymph Support', category: 'Lymph & Circulation',
      steps: [15.05, 10.36, 3176].map((hz) => ({ hz, seconds: 360 })),
    },
    {
      id: 'preset-arteries', name: 'Arteries — CAFL Arteriosclerosis', category: 'Lymph & Circulation',
      steps: [10000, 2720, 2170, 1800, 1600, 1500, 880, 787, 776, 727, 20].map((hz) => ({ hz, seconds: 180 })),
    },
    {
      id: 'preset-tapeworm-totalkill', name: 'Tapeworm — Total Kill (One Session)', category: 'Parasites', favorite: 1,
      steps: [
        { hz: 522, seconds: 300 }, { hz: 562, seconds: 300 }, { hz: 843, seconds: 300 },
        { hz: 1223, seconds: 300 }, { hz: 3032, seconds: 300 }, { hz: 5522, seconds: 300 },
        { hz: 728, seconds: 180 }, { hz: 784, seconds: 180 }, { hz: 880, seconds: 180 }, { hz: 465, seconds: 180 },
        { hz: 522, seconds: 300 }, { hz: 562, seconds: 300 }, { hz: 843, seconds: 300 },
      ],
    },
  ];

  function seedPresets() {
    for (const p of BUILTIN_PRESETS) {
      if (Store.get('presets', p.id)) continue; // never resurrect deleted/edited ones
      Store.upsert('presets', {
        id: p.id, name: p.name, category: p.category, builtin: 1, favorite: p.favorite || 0,
        steps_json: JSON.stringify(p.steps || p.freqs.map((hz) => ({ hz, seconds: 180 }))),
        created_by: 'Vibrant research',
      });
    }
  }

  function presetSteps(p) { try { return JSON.parse(p.steps_json || '[]'); } catch { return []; } }

  function renderPresets() {
    const groupsEl = $('#preset-groups');
    if (!groupsEl) return;
    const presets = Store.rows('presets').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const cats = [...new Set(presets.map((p) => p.category || 'General'))].sort();
    groupsEl.innerHTML = presets.length ? cats.map((cat) => `
      <div class="preset-group">
        <h3>${cat}</h3>
        <div class="preset-grid">
          ${presets.filter((p) => (p.category || 'General') === cat).map((p) => {
            const steps = presetSteps(p);
            const rating = Brain.ratingSummary(p.id);
            return `
            <div class="preset-card" data-id="${p.id}">
              <div class="preset-name">${p.name} ${p.favorite ? '★' : ''}</div>
              <div class="preset-meta">${steps.length} steps · ${fmtTime(protoTotal(steps))} total
                ${rating ? ` · ★ ${rating.avg.toFixed(1)} (${rating.count})` : ''}</div>
              <div class="preset-freqs">${steps.slice(0, 8).map((s) => fmtHz(s.hz)).join(' · ')}${steps.length > 8 ? ' …' : ''}</div>
              <div class="preset-actions">
                <button class="btn primary run-preset">▶ Run</button>
                <button class="btn edit-preset">Edit</button>
                <button class="btn dup-preset">Copy</button>
                <button class="btn fav-preset">${p.favorite ? '★' : '☆'}</button>
                <button class="btn danger del-preset">✕</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`).join('') : '<p class="muted">No protocols yet — tap “New Protocol”.</p>';

    $$('#preset-groups .preset-card').forEach((card) => {
      const p = Store.get('presets', card.dataset.id);
      card.querySelector('.run-preset').addEventListener('click', () =>
        Player.start({ name: p.name, presetId: p.id, steps: presetSteps(p) }));
      card.querySelector('.edit-preset').addEventListener('click', () => openBuilder(p));
      card.querySelector('.dup-preset').addEventListener('click', () => {
        Store.upsert('presets', {
          id: undefined, name: p.name + ' (copy)', category: p.category,
          steps_json: p.steps_json, created_by: currentUser?.name || '',
        });
        renderPresets();
      });
      card.querySelector('.fav-preset').addEventListener('click', () => {
        Store.upsert('presets', { ...p, favorite: p.favorite ? 0 : 1 });
        renderPresets();
      });
      card.querySelector('.del-preset').addEventListener('click', () => {
        if (confirm(`Delete "${p.name}"?`)) { Store.softDelete('presets', p.id); renderPresets(); }
      });
    });
  }

  // ---------- protocol builder ----------
  let builderState = { id: null, kbId: null, steps: [] };

  function openBuilder(preset, fromBrain) {
    builderState = preset
      ? { id: preset.id, kbId: fromBrain ? preset.kbId : null, steps: presetSteps(preset).map((s) => ({ ...s })) }
      : { id: null, kbId: null, steps: [{ hz: 728, seconds: 180 }] };
    $('#builder-title').textContent = preset ? (preset.id ? 'Edit Protocol' : 'New Protocol') : 'New Protocol';
    $('#b-name').value = preset ? preset.name : '';
    $('#b-category').value = preset ? (preset.category || 'General') : 'General';
    renderBuilderSteps();
    $('#builder-modal').classList.remove('hidden');
  }

  function renderBuilderSteps() {
    $('#b-steps').innerHTML = builderState.steps.map((s, i) => `
      <div class="b-step" data-i="${i}">
        <span class="b-num">${i + 1}</span>
        <input type="number" class="b-hz" value="${s.hz}" min="0.1" max="100000" step="0.1" title="Frequency (Hz)"> Hz
        <input type="number" class="b-min" value="${Math.floor(s.seconds / 60)}" min="0" max="120" title="Minutes"> m
        <input type="number" class="b-sec" value="${s.seconds % 60}" min="0" max="59" title="Seconds"> s
        <label class="b-sweep-label"><input type="checkbox" class="b-sweep-on" ${s.sweepToHz ? 'checked' : ''}> sweep→</label>
        <input type="number" class="b-sweep" value="${s.sweepToHz || ''}" min="0.1" max="100000" step="0.1"
          placeholder="Hz" ${s.sweepToHz ? '' : 'disabled'}>
        <button class="btn b-up" title="Move up">↑</button>
        <button class="btn b-down" title="Move down">↓</button>
        <button class="btn danger b-del" title="Remove">✕</button>
      </div>`).join('');
    $('#b-total').textContent = 'Total: ' + fmtTime(protoTotal(builderState.steps));

    $$('#b-steps .b-step').forEach((row) => {
      const i = Number(row.dataset.i);
      const sync = () => {
        const s = builderState.steps[i];
        s.hz = Math.min(100000, Math.max(0.1, Number(row.querySelector('.b-hz').value) || 0.1));
        s.seconds = Math.max(1, (Number(row.querySelector('.b-min').value) || 0) * 60 + (Number(row.querySelector('.b-sec').value) || 0));
        const on = row.querySelector('.b-sweep-on').checked;
        row.querySelector('.b-sweep').disabled = !on;
        s.sweepToHz = on ? (Number(row.querySelector('.b-sweep').value) || null) : null;
        if (s.sweepToHz === null && on === false) delete s.sweepToHz;
        $('#b-total').textContent = 'Total: ' + fmtTime(protoTotal(builderState.steps));
      };
      row.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', sync));
      row.querySelector('.b-sweep-on').addEventListener('change', () => { sync(); renderBuilderSteps(); });
      row.querySelector('.b-del').addEventListener('click', () => {
        builderState.steps.splice(i, 1); renderBuilderSteps();
      });
      row.querySelector('.b-up').addEventListener('click', () => {
        if (i > 0) { [builderState.steps[i - 1], builderState.steps[i]] = [builderState.steps[i], builderState.steps[i - 1]]; renderBuilderSteps(); }
      });
      row.querySelector('.b-down').addEventListener('click', () => {
        if (i < builderState.steps.length - 1) { [builderState.steps[i + 1], builderState.steps[i]] = [builderState.steps[i], builderState.steps[i + 1]]; renderBuilderSteps(); }
      });
    });
  }

  function builderProtocol() {
    return {
      name: $('#b-name').value.trim() || 'Untitled Protocol',
      steps: builderState.steps.filter((s) => s.hz > 0 && s.seconds > 0),
    };
  }

  function saveBuilder(run) {
    const proto = builderProtocol();
    if (!proto.steps.length) { toast('Add at least one step'); return; }
    const id = Store.upsert('presets', {
      id: builderState.id || undefined,
      name: proto.name,
      category: $('#b-category').value || 'General',
      steps_json: JSON.stringify(proto.steps),
      created_by: currentUser?.name || '',
    });
    $('#builder-modal').classList.add('hidden');
    renderPresets();
    toast('Protocol saved');
    if (run) Player.start({ name: proto.name, presetId: id, steps: proto.steps });
  }

  // ---------- Brain UI ----------
  function renderBrainResults(q) {
    const el = $('#brain-results');
    const detail = $('#brain-detail');
    detail.classList.add('hidden');
    el.classList.remove('hidden');
    const results = q && q.trim() ? Brain.search(q) : Brain.all().sort((a, b) => a.condition.localeCompare(b.condition));
    el.innerHTML = results.length ? results.map((e) => `
      <button class="brain-card" data-id="${e.id}">
        <span class="brain-cond">${e.condition}</span>
        <span class="brain-meta">
          <span class="badge cat">${e.category}</span>
          <span class="badge src ${e.source === 'Vibrant research' ? 'vibrant' : ''}">${e.source}</span>
          ${e.verify ? '<span class="badge warn">verify</span>' : ''}
          ${Brain.tunedProtocol(e.id) ? '<span class="badge tuned">🎓 tuned</span>' : ''}
          ${e.noReliableListing ? '<span class="badge none">no reliable listing</span>' : `<span class="badge">${e.frequencies.length} freqs</span>`}
        </span>
      </button>`).join('') : '<p class="muted">Nothing found. Try another name, or add it via Admin → Add Research.</p>';
    $$('#brain-results .brain-card').forEach((b) =>
      b.addEventListener('click', () => renderBrainDetail(b.dataset.id)));
  }

  let brainSteps = [];
  function renderBrainDetail(kbId) {
    const e = Brain.get(kbId);
    if (!e) return;
    const tuned = Brain.tunedProtocol(kbId);
    const rating = Brain.ratingSummary(kbId);
    $('#brain-results').classList.add('hidden');
    const detail = $('#brain-detail');
    detail.classList.remove('hidden');

    if (e.noReliableListing) {
      detail.innerHTML = `
        <button class="btn" id="brain-back">← Back</button>
        <h2>${e.condition}</h2>
        <p class="brain-none">No reliable CAFL/Rife listing exists for this organism — the Brain won't invent numbers.</p>
        <p class="muted">${e.notes || ''}</p>`;
      $('#brain-back').addEventListener('click', () => renderBrainResults($('#brain-q').value));
      return;
    }

    const proto = tuned ? { name: tuned.name, kbId, steps: tuned.steps.map((s) => ({ ...s })) } : Brain.buildProtocol(e);
    brainSteps = proto.steps;

    detail.innerHTML = `
      <button class="btn" id="brain-back">← Back</button>
      <h2>${e.condition}</h2>
      <p class="brain-src">
        <span class="badge cat">${e.category}</span>
        <span class="badge src ${e.source === 'Vibrant research' ? 'vibrant' : ''}">${e.source}</span>
        ${e.verify ? '<span class="badge warn">starter data — verify</span>' : ''}
        ${rating ? `<span class="badge">★ ${rating.avg.toFixed(1)} · ${rating.count} session${rating.count > 1 ? 's' : ''}</span>` : ''}
      </p>
      ${tuned ? `<div class="tuned-banner">🎓 Showing <b>your tuned version</b> (trained ${new Date(tuned.tunedAt).toLocaleDateString()}). The Brain remembers your adjustments.</div>` : ''}
      ${e.notes ? `<p class="muted">${e.notes}</p>` : ''}
      <div class="brain-proto" id="brain-proto"></div>
      <div class="brain-actions">
        <button class="btn primary" id="brain-run">▶ Run Now</button>
        <button class="btn" id="brain-save-preset">💾 Save to Protocol Bank</button>
        <button class="btn" id="brain-train">🎓 Train Brain with My Edits</button>
        ${tuned ? '<button class="btn" id="brain-stock">↺ Show Stock Version</button>' : ''}
      </div>`;

    renderBrainProto();
    $('#brain-back').addEventListener('click', () => renderBrainResults($('#brain-q').value));
    $('#brain-run').addEventListener('click', () => {
      maybeAutoTrain(e, tuned);
      Player.start({ name: e.condition, kbId: e.id, steps: brainSteps.filter((s) => s.hz > 0 && s.seconds > 0) });
    });
    $('#brain-save-preset').addEventListener('click', () => {
      Store.upsert('presets', {
        id: undefined, name: e.condition, category: e.category,
        steps_json: JSON.stringify(brainSteps), created_by: 'Brain + ' + (currentUser?.name || ''),
      });
      toast('Saved to Protocol Bank');
    });
    $('#brain-train').addEventListener('click', () => {
      Brain.saveTunedProtocol(e.id, { name: e.condition, steps: brainSteps }, 'Manually trained by ' + (currentUser?.name || ''));
      toast('🎓 The Brain learned your version — it will offer it first from now on');
      renderTraining();
      renderBrainDetail(e.id);
    });
    const stockBtn = $('#brain-stock');
    if (stockBtn) stockBtn.addEventListener('click', () => {
      brainSteps = Brain.buildProtocol(e).steps;
      renderBrainProto();
      toast('Showing stock listing (your tuned version is still remembered)');
    });
  }

  function maybeAutoTrain(entry, tuned) {
    // If the user edited the proposal and runs it, the Brain quietly learns the change.
    const baseline = tuned ? tuned.steps : Brain.buildProtocol(entry).steps;
    if (JSON.stringify(baseline) !== JSON.stringify(brainSteps)) {
      Brain.saveTunedProtocol(entry.id, { name: entry.condition, steps: brainSteps }, 'Learned from edited run by ' + (currentUser?.name || ''));
      toast('🎓 Brain learned your adjustments');
    }
  }

  function renderBrainProto() {
    $('#brain-proto').innerHTML = `
      <div class="b-steps-mini">
        ${brainSteps.map((s, i) => `
          <div class="b-step" data-i="${i}">
            <span class="b-num">${i + 1}</span>
            <input type="number" class="b-hz" value="${s.hz}" min="0.1" max="100000" step="0.1"> Hz
            <input type="number" class="b-min" value="${Math.floor(s.seconds / 60)}" min="0" max="120"> m
            <input type="number" class="b-sec" value="${s.seconds % 60}" min="0" max="59"> s
            <button class="btn danger b-del">✕</button>
          </div>`).join('')}
      </div>
      <div class="row-between">
        <button class="btn" id="brain-add-step">+ Add Step</button>
        <span class="muted">Total: ${fmtTime(protoTotal(brainSteps))}</span>
      </div>`;
    $$('#brain-proto .b-step').forEach((row) => {
      const i = Number(row.dataset.i);
      const sync = () => {
        brainSteps[i].hz = Math.min(100000, Math.max(0.1, Number(row.querySelector('.b-hz').value) || 0.1));
        brainSteps[i].seconds = Math.max(1, (Number(row.querySelector('.b-min').value) || 0) * 60 + (Number(row.querySelector('.b-sec').value) || 0));
        renderBrainProto();
      };
      row.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', sync));
      row.querySelector('.b-del').addEventListener('click', () => { brainSteps.splice(i, 1); renderBrainProto(); });
    });
    $('#brain-add-step').addEventListener('click', () => {
      brainSteps.push({ hz: 728, seconds: 180 });
      renderBrainProto();
    });
  }

  // ---------- Brain AI chat ----------
  const chatHistory = []; // [{role, content}] — content is the raw JSON/text exchanged with the API

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function miniMd(s) {
    return escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  }

  function updateChatKeyNotice() {
    const noKey = !BrainAI.hasKey();
    $('#bc-nokey').classList.toggle('hidden', !noKey);
    $('#bc-send').disabled = noKey;
  }

  function addChatBubble(role, html) {
    const el = document.createElement('div');
    el.className = 'bc-msg ' + role;
    el.innerHTML = html;
    $('#bc-thread').appendChild(el);
    $('#bc-thread').scrollTop = $('#bc-thread').scrollHeight;
    return el;
  }

  function renderChatProtocol(container, proto) {
    const total = protoTotal(proto.steps);
    const card = document.createElement('div');
    card.className = 'bc-proto';
    card.innerHTML = `
      <div class="bc-proto-name">${escapeHtml(proto.name)}</div>
      <div class="bc-proto-steps">${proto.steps.map((s, i) =>
        `<span class="bc-step">${i + 1}. ${fmtHz(s.hz)}${s.sweepToHz ? '→' + fmtHz(s.sweepToHz) : ''} Hz · ${fmtTime(s.seconds)}</span>`).join('')}</div>
      <div class="bc-proto-meta muted">${proto.steps.length} steps · ${fmtTime(total)} total</div>
      <div class="bc-proto-actions">
        <button class="btn primary bc-run">▶ Run Now</button>
        <button class="btn bc-save">💾 Save to Bank</button>
      </div>`;
    container.appendChild(card);
    // Link to a KB entry when the AI protocol clearly matches one (enables rating→training)
    const kbMatch = Brain.search(proto.name)[0];
    const kbId = kbMatch && kbMatch.condition.toLowerCase() === proto.name.toLowerCase() ? kbMatch.id : null;
    card.querySelector('.bc-run').addEventListener('click', () =>
      Player.start({ name: proto.name, kbId, steps: proto.steps.map((s) => ({ ...s })) }));
    card.querySelector('.bc-save').addEventListener('click', () => {
      Store.upsert('presets', {
        id: undefined, name: proto.name, category: 'General',
        steps_json: JSON.stringify(proto.steps), created_by: 'AI Brain + ' + (currentUser?.name || ''),
      });
      toast('Saved to Protocol Bank');
      renderPresets();
    });
  }

  async function sendChat() {
    const input = $('#bc-input');
    const text = input.value.trim();
    if (!text || $('#bc-send').disabled) return;
    input.value = '';
    addChatBubble('user', miniMd(text));
    chatHistory.push({ role: 'user', content: text });
    const thinking = addChatBubble('assistant thinking', '<span class="bc-dots"><span>·</span><span>·</span><span>·</span></span> The Brain is thinking…');
    $('#bc-send').disabled = true;

    const result = await BrainAI.ask(chatHistory);
    thinking.remove();
    $('#bc-send').disabled = !BrainAI.hasKey();

    if (result.error) {
      if (result.error === 'no_key') updateChatKeyNotice();
      else addChatBubble('assistant error', '⚠ ' + escapeHtml(result.detail || 'Something went wrong — try again.'));
      chatHistory.pop(); // let them retry the same question
      input.value = text;
      return;
    }

    const bubble = addChatBubble('assistant', miniMd(result.reply || ''));
    if (result.protocol) renderChatProtocol(bubble, result.protocol);
    // Keep the assistant turn in history exactly as the API produced it
    chatHistory.push({ role: 'assistant', content: JSON.stringify(result) });
    $('#bc-thread').scrollTop = $('#bc-thread').scrollHeight;
  }

  // ---------- Admin ----------
  let adminUnlocked = false;

  function renderAdminGate() {
    $('#admin-gate').classList.toggle('hidden', adminUnlocked);
    $('#admin-content').classList.toggle('hidden', !adminUnlocked);
    if (adminUnlocked) { renderAdminSessions(); renderAdminUsers(); renderTraining(); renderBackupStatus(); }
  }

  function tryAdminPin() {
    if ($('#admin-pin').value === pins().admin) {
      adminUnlocked = true;
      $('#admin-pin').value = '';
      renderAdminGate();
    } else {
      $('#admin-pin').value = '';
      toast('Wrong admin PIN');
    }
  }

  function switchAdminSection(sec) {
    $$('.admin-nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.sec === sec));
    $$('.admin-sec').forEach((p) => p.classList.toggle('hidden', p.id !== 'sec-' + sec));
  }

  // Sessions log
  function filteredSessions() {
    const u = $('#flt-user')?.value || '';
    const from = $('#flt-from')?.value ? new Date($('#flt-from').value).getTime() : 0;
    const to = $('#flt-to')?.value ? new Date($('#flt-to').value).getTime() + 86400000 : Infinity;
    const q = ($('#flt-q')?.value || '').toLowerCase();
    return Store.rows('sessions')
      .filter((s) => (!u || s.user_name === u) && s.started_at >= from && s.started_at <= to &&
        (!q || (s.protocol_name || '').toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q)))
      .sort((a, b) => b.started_at - a.started_at);
  }

  function renderAdminSessions() {
    const tbody = $('#sessions-table tbody');
    if (!tbody) return;
    // user filter options
    const sel = $('#flt-user');
    const names = [...new Set(Store.rows('sessions').map((s) => s.user_name).filter(Boolean))].sort();
    const cur = sel.value;
    sel.innerHTML = '<option value="">All users</option>' + names.map((n) => `<option ${n === cur ? 'selected' : ''}>${n}</option>`).join('');
    const sessions = filteredSessions();
    tbody.innerHTML = sessions.length ? sessions.map((s) => `
      <tr>
        <td>${new Date(s.started_at).toLocaleDateString()}<br><span class="muted">${new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
        <td>${s.user_name || '—'}</td>
        <td>${s.protocol_name || '—'}</td>
        <td>${s.steps_completed}/${s.steps_planned} ${s.completed ? '✅' : '⏹'}</td>
        <td>${fmtTime(s.total_seconds || 0)}</td>
        <td>${s.rating ? '★'.repeat(s.rating) : '—'}</td>
        <td class="muted">${s.notes || ''}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="muted">No sessions logged yet.</td></tr>';
  }

  function exportCsv() {
    const rows = [['Date', 'Time', 'User', 'Protocol', 'Steps Completed', 'Steps Planned', 'Completed', 'Minutes', 'Rating', 'Notes', 'Frequencies']];
    for (const s of filteredSessions()) {
      let freqs = '';
      try { freqs = JSON.parse(s.steps_json).map((st) => st.hz).join(' '); } catch {}
      rows.push([
        new Date(s.started_at).toLocaleDateString(), new Date(s.started_at).toLocaleTimeString(),
        s.user_name || '', s.protocol_name || '', s.steps_completed, s.steps_planned,
        s.completed ? 'yes' : 'no', (s.total_seconds / 60).toFixed(1), s.rating || '', (s.notes || '').replace(/"/g, "'"), freqs,
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    download('vibrant-resonance-sessions.csv', csv, 'text/csv');
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Users admin
  function renderAdminUsers() {
    const el = $('#admin-user-list');
    if (!el) return;
    const users = Store.rows('users').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    el.innerHTML = users.length ? users.map((u) => `
      <div class="admin-user ${u.active === 0 ? 'inactive' : ''}" data-id="${u.id}">
        <span>${u.name}</span>
        <span>
          <button class="btn u-rename">Rename</button>
          <button class="btn u-toggle">${u.active === 0 ? 'Reactivate' : 'Deactivate'}</button>
        </span>
      </div>`).join('') : '<p class="muted">No users yet.</p>';
    $$('#admin-user-list .admin-user').forEach((row) => {
      const u = Store.get('users', row.dataset.id);
      row.querySelector('.u-rename').addEventListener('click', () => {
        const name = prompt('New name for ' + u.name, u.name);
        if (name && name.trim()) { Store.upsert('users', { ...u, name: name.trim() }); refresh(); }
      });
      row.querySelector('.u-toggle').addEventListener('click', () => {
        Store.upsert('users', { ...u, active: u.active === 0 ? 1 : 0 }); refresh();
      });
    });
  }

  // Research importer
  let parsedResearch = null;
  function previewResearch() {
    const { entries, errors } = Brain.parseResearch($('#research-text').value);
    parsedResearch = entries;
    $('#research-preview').innerHTML = `
      ${errors.length ? `<div class="import-errors">${errors.map((e) => `<div>⚠ ${e}</div>`).join('')}</div>` : ''}
      ${entries.length ? `
        <table class="mini-table"><thead><tr><th>Condition</th><th>Category</th><th>Frequencies</th><th>Dwell</th></tr></thead>
        <tbody>${entries.map((e) => `<tr><td>${e.condition}</td><td>${e.category}</td><td>${e.frequencies.join(', ')}</td><td>${e.dwell}s</td></tr>`).join('')}</tbody></table>
        <p class="muted">${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} ready. Existing entries with the same name are updated; <b>Brain training is never touched by imports.</b></p>`
        : '<p class="muted">Nothing parsed yet.</p>'}`;
    $('#research-apply').disabled = !entries.length;
  }

  function applyResearch() {
    if (!parsedResearch?.length) return;
    const n = Brain.importEntries(parsedResearch);
    toast(`🧠 Brain updated — ${n} entr${n === 1 ? 'y' : 'ies'} added/refreshed. Training preserved.`);
    $('#research-text').value = '';
    $('#research-preview').innerHTML = '';
    $('#research-apply').disabled = true;
    parsedResearch = null;
  }

  // Training view
  function renderTraining() {
    const el = $('#training-list');
    if (!el) return;
    const rows = Brain.allTraining();
    el.innerHTML = rows.length ? rows.map((r) => {
      const ref = Brain.get(r.ref_id);
      const what = r.kind === 'tuned-protocol'
        ? `Tuned protocol (${(r.payload.steps || []).length} steps)`
        : r.kind === 'rating' ? `Rating ${'★'.repeat(r.payload.rating || 0)}${r.payload.notes ? ' — ' + r.payload.notes : ''}`
        : r.kind;
      return `
      <div class="training-row" data-id="${r.id}">
        <div>
          <b>${ref ? ref.condition : (r.ref_id || '—')}</b> · ${what}
          <div class="muted">${new Date(r.created_at).toLocaleString()}</div>
        </div>
        <button class="btn danger t-del">✕</button>
      </div>`;
    }).join('') : '<p class="muted">No training yet. Edit a Brain protocol or rate a session and it will appear here.</p>';
    $$('#training-list .training-row').forEach((row) => {
      row.querySelector('.t-del').addEventListener('click', () => {
        if (confirm('Remove this training item?')) { Store.softDelete('training', row.dataset.id); renderTraining(); }
      });
    });
  }

  // Backup + settings
  function renderBackupStatus() {
    const backend = Store.hasSyncToken ? 'Cloud (all locations)' : 'Local server / this device';
    $('#backup-status').innerHTML = `
      <div>Backend: <b>${backend}</b></div>
      <div>Status: <b>${Store.isOnline ? 'connected ✅' : (Store.lastError || 'not connected — data stays on this device')}</b></div>
      <div>Last sync: <b>${Store.lastSync ? new Date(Store.lastSync).toLocaleString() : 'never'}</b></div>
      <div>This device: <span class="muted">${Store.deviceId()}</span></div>`;
    $('#set-voice').checked = Store.setting('voice', true);
    $('#sync-token-status').textContent = Store.hasSyncToken
      ? '✅ Cloud sync connected on this device'
      : 'Not connected yet — paste the sync token to join the shared database.';
    renderApiKeyStatus();
  }

  function renderApiKeyStatus() {
    const key = Store.setting('anthropic_key', '');
    $('#api-key-status').textContent = key
      ? `✅ AI Brain enabled (key …${key.slice(-6)})`
      : 'No key yet — get one at platform.claude.com, paste it here, and the Brain becomes conversational.';
  }

  // ---------- wiring ----------
  function bind() {
    // Lock pad
    $('#lock-pad').addEventListener('click', (e) => {
      const key = e.target.closest('[data-key]')?.dataset.key;
      if (key) pressKey(key);
    });
    window.addEventListener('keydown', (e) => {
      if (!$('#lock-screen').classList.contains('hidden')) {
        if (/^[0-9]$/.test(e.key)) pressKey(e.key);
        if (e.key === 'Backspace') pressKey('back');
      }
    });
    renderDots();

    // User screen
    $('#add-user-btn').addEventListener('click', () => { addUser($('#new-user-name').value); $('#new-user-name').value = ''; });
    $('#new-user-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { addUser(e.target.value); e.target.value = ''; }
    });
    $('#switch-user').addEventListener('click', () => {
      if (Player.running) { toast('Stop the session first'); return; }
      AudioEngine.stop();
      $('#main-app').classList.add('hidden');
      showUserScreen();
    });

    // Tabs
    $$('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    // Generator
    $('#gen-freq').addEventListener('change', (e) => setGenHz(e.target.value));
    $$('#gen-nudge button').forEach((b) => b.addEventListener('click', () => setGenHz(genHz + Number(b.dataset.d))));
    $('#gen-play').addEventListener('click', toggleGenPlay);
    $('#gen-volume').addEventListener('input', (e) => {
      AudioEngine.setVolume(Number(e.target.value) / 100);
      $('#gen-vol-label').textContent = e.target.value + '%';
    });
    $$('#gen-chips button').forEach((b) => b.addEventListener('click', () => setGenHz(Number(b.dataset.hz))));

    // Protocols
    $('#new-preset-btn').addEventListener('click', () => openBuilder(null));
    $('#b-add-step').addEventListener('click', () => { builderState.steps.push({ hz: 728, seconds: 180 }); renderBuilderSteps(); });
    $('#b-save').addEventListener('click', () => saveBuilder(false));
    $('#b-run').addEventListener('click', () => saveBuilder(true));
    $('#b-cancel').addEventListener('click', () => $('#builder-modal').classList.add('hidden'));

    // Brain
    $('#brain-q').addEventListener('input', (e) => renderBrainResults(e.target.value));
    $('#bc-send').addEventListener('click', sendChat);
    $('#bc-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });

    // Admin
    $('#admin-enter').addEventListener('click', tryAdminPin);
    $('#admin-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryAdminPin(); });
    $$('.admin-nav-btn').forEach((b) => b.addEventListener('click', () => switchAdminSection(b.dataset.sec)));
    ['flt-user', 'flt-from', 'flt-to', 'flt-q'].forEach((id) =>
      $('#' + id).addEventListener('input', renderAdminSessions));
    $('#export-csv').addEventListener('click', exportCsv);
    $('#admin-add-user').addEventListener('click', () => { addUser($('#admin-new-user').value); $('#admin-new-user').value = ''; });
    $('#research-preview-btn').addEventListener('click', previewResearch);
    $('#research-apply').addEventListener('click', applyResearch);
    $('#backup-export').addEventListener('click', () =>
      download('vibrant-resonance-backup-' + new Date().toISOString().slice(0, 10) + '.json', Store.exportAll(), 'application/json'));
    $('#backup-import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const n = Store.importAll(await file.text());
        toast(`Backup restored — ${n} records merged`);
        refresh();
      } catch (err) { toast('Import failed: ' + err.message); }
      e.target.value = '';
    });
    $('#set-voice').addEventListener('change', (e) => Store.setSetting('voice', e.target.checked));
    $('#save-sync-token').addEventListener('click', () => {
      const t = $('#set-sync-token').value.trim();
      if (!t) { toast('Paste the sync token first'); return; }
      Store.setSyncToken(t);
      $('#set-sync-token').value = '';
      toast('☁ Connecting to the shared database…');
      setTimeout(() => { renderBackupStatus(); updateSyncBadge(); }, 2500);
    });
    $('#save-api-key').addEventListener('click', () => {
      const key = $('#set-api-key').value.trim();
      if (!key.startsWith('sk-ant-')) { toast('That does not look like an Anthropic key (sk-ant-…)'); return; }
      Store.setSetting('anthropic_key', key);
      $('#set-api-key').value = '';
      renderApiKeyStatus();
      updateChatKeyNotice();
      toast('🧠 AI Brain enabled');
    });

    Player.bind();
    Store.onChange((what) => {
      if (what === 'online') updateSyncBadge();
      else if (what === '*') refresh();
    });
  }

  function init() {
    bind();
    seedPresets();
    Store.sync();
    updateSyncBadge();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    refresh, toast,
    currentUserId: () => currentUser?.id || null,
    currentUserName: () => currentUser?.name || null,
  };
})();
