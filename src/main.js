// 画面の動きをまとめたファイル。
import { callClaude, callGemini, extractJson } from './llm.js';
import * as P from './prompts.js';
import { SONG_SCHEMA, ENHANCE_SCHEMA, HOOKS_SCHEMA, ANALYSIS_SCHEMA } from './schemas.js';
import { LIMITS, lintSong, normalizeLyrics, normalizeStyle, toCopyBlock } from './suno.js';
import { analyzeLocally, fileToBase64 } from './audio.js';
import { KNOWLEDGE, CONFIDENCE_LABEL, CREATOR_RULES, SUNO_RIGHTS_NOTE } from './knowledge.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- 保存(このブラウザの中だけ) ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`mc:${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`mc:${key}`, JSON.stringify(value));
    } catch (_) {}
  },
  remove(key) {
    try {
      localStorage.removeItem(`mc:${key}`);
    } catch (_) {}
  },
};

const DEFAULTS = {
  claudeModel: 'claude-opus-5-5',
  claudeEffort: 'high',
  geminiModel: 'gemini-3.1-pro-preview',
};
const settings = () => ({ ...DEFAULTS, ...store.get('settings', {}) });

const state = {
  song: store.get('song', null),
  analysis: store.get('analysis', null),
  hooks: null,
  lastComposeInput: null,
};

// ---------- 共通UI ----------
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('コピーしました');
}

function setStatus(id, msg, kind = 'busy') {
  const el = $(id);
  if (!msg) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `status ${kind}`;
  el.textContent = msg;
}

function switchTab(name) {
  document.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  store.set('tab', name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function withBusy(statusId, label, fn) {
  const buttons = document.querySelectorAll('button[data-run]');
  buttons.forEach((b) => (b.disabled = true));
  const started = Date.now();
  let chars = 0;
  const tick = setInterval(() => {
    const sec = Math.round((Date.now() - started) / 1000);
    setStatus(statusId, `${label}(${sec}秒経過${chars ? `・${chars}文字受信` : '・考え中'})`);
  }, 500);
  try {
    setStatus(statusId, `${label}…`);
    await fn((n) => (chars = n));
    setStatus(statusId, '');
  } catch (err) {
    console.error(err);
    setStatus(statusId, err.message || String(err), 'error');
  } finally {
    clearInterval(tick);
    buttons.forEach((b) => (b.disabled = false));
  }
}

// ---------- 入力の取得 ----------
function composeInput() {
  return {
    message: $('c-message').value.trim(),
    audience: $('c-audience').value.trim(),
    narrator: $('c-narrator').value.trim(),
    when: $('c-when').value.trim(),
    genre: $('c-genre').value.trim(),
    mood: $('c-mood').value.trim(),
    vocal: $('c-vocal').value.trim(),
    language: $('c-language').value,
    length: $('c-length').value,
    count: Number($('c-count').value),
    extra: $('c-extra').value.trim(),
    reference: $('c-use-ref').checked ? referenceText() : '',
  };
}

function enhanceInput() {
  return {
    lyrics: $('e-lyrics').value.trim(),
    message: $('e-message').value.trim(),
    genre: $('e-genre').value.trim(),
    strength: $('e-strength').value,
    extra: $('e-extra').value.trim(),
    reference: $('e-use-ref').checked ? referenceText() : '',
  };
}

function referenceText() {
  const a = state.analysis;
  if (!a) return '';
  return [
    `ジャンル:${a.genre}(${(a.subgenres || []).join(', ')})/年代感:${a.era_feel}`,
    `テンポ:${a.bpm_estimate}/キー:${a.key_estimate}/拍子:${a.time_signature}`,
    `ムード:${(a.mood || []).join(', ')}`,
    `エネルギーの流れ:${a.energy_curve}`,
    `楽器:${(a.instrumentation || []).join(', ')}`,
    `ボーカル:${a.vocal?.gender}/${a.vocal?.timbre}/${a.vocal?.delivery}`,
    `音作り:${(a.production || []).join(', ')}`,
    `フックの仕掛け:${(a.hook_devices || []).join(' / ')}`,
    `言葉の詰め方:${a.syllable_density}`,
    `参考 Style:${a.suno_style}`,
  ].join('\n');
}

function requireText(value, msg, statusId) {
  if (!value) {
    setStatus(statusId, msg, 'error');
    return false;
  }
  return true;
}

// ---------- 各モードの実行 ----------
async function runHooks() {
  const input = composeInput();
  if (!requireText(input.message, '「伝えたいメッセージ」を入力してください。', 'c-status')) return;
  state.lastComposeInput = input;
  const s = settings();
  await withBusy('c-status', `Claude が ${input.count} 案を作っています`, async (onProgress) => {
    const result = await callClaude({
      apiKey: s.claudeKey,
      model: s.claudeModel,
      effort: s.claudeEffort,
      system: P.systemForHooks(),
      user: P.userForHooks(input),
      schema: HOOKS_SCHEMA,
      onProgress,
    });
    showHooks(result);
  });
}

async function runCompose(candidate) {
  const input = candidate && state.lastComposeInput ? state.lastComposeInput : composeInput();
  if (!requireText(input.message, '「伝えたいメッセージ」を入力してください。', 'c-status')) return;
  state.lastComposeInput = input;
  const s = settings();
  await withBusy('c-status', 'Claude が1曲に仕上げています', async (onProgress) => {
    const song = await callClaude({
      apiKey: s.claudeKey,
      model: s.claudeModel,
      effort: s.claudeEffort,
      system: P.systemForCompose(),
      user: candidate ? P.userForExpand(input, candidate) : P.userForCompose(input),
      schema: SONG_SCHEMA,
      onProgress,
    });
    setSong(song, 'Claude');
  });
}

async function runEnhance() {
  const input = enhanceInput();
  if (!requireText(input.lyrics, '補強したい歌詞を貼り付けてください。', 'e-status')) return;
  const s = settings();
  await withBusy('e-status', 'Gemini が歌詞を補強しています', async (onProgress) => {
    const song = await callGemini({
      apiKey: s.geminiKey,
      model: s.geminiModel,
      system: P.systemForEnhance(),
      parts: [{ text: P.userForEnhance(input) }],
      schema: ENHANCE_SCHEMA,
      onProgress,
    });
    showChanges(song.changes);
    setSong(song, 'Gemini');
  });
}

const MAX_INLINE_MB = 15; // Gemini はリクエスト全体で20MBまで(base64で約1.33倍になるため余裕を持たせる)

async function runAnalyze() {
  const file = $('a-file').files[0];
  const youtube = $('a-youtube').value.trim();
  const title = $('a-title').value.trim();
  const notes = $('a-notes').value.trim();
  if (!file && !youtube && !title) {
    setStatus('a-status', '音声ファイル・YouTube の URL・曲名のどれかを入力してください。', 'error');
    return;
  }
  if (file && file.size > MAX_INLINE_MB * 1024 * 1024) {
    setStatus('a-status', `音声ファイルが大きすぎます(${MAX_INLINE_MB}MB まで)。mp3 に変換するか、曲の一部を切り出してください。`, 'error');
    return;
  }
  if (youtube && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(youtube)) {
    setStatus('a-status', 'YouTube の URL の形式が正しくないようです。', 'error');
    return;
  }
  const s = settings();
  await withBusy('a-status', 'Gemini が楽曲を分析しています', async (onProgress) => {
    let local = null;
    if (file) {
      try {
        local = await analyzeLocally(file);
      } catch (_) {
        local = null; // 端末で読めない形式でも Gemini 側の分析は続ける
      }
    }
    const parts = [];
    if (file) parts.push({ inlineData: { mimeType: file.type || 'audio/mpeg', data: await fileToBase64(file) } });
    if (youtube) parts.push({ fileData: { fileUri: youtube } });
    parts.push({ text: P.userForAnalysis({ title, notes, local }) });
    const result = await callGemini({
      apiKey: s.geminiKey,
      model: s.geminiModel,
      system: P.systemForAnalysis(),
      parts,
      schema: ANALYSIS_SCHEMA,
      onProgress,
    });
    setAnalysis(result, local);
  });
}

async function runLocalOnly() {
  const file = $('a-file').files[0];
  if (!file) {
    setStatus('a-status', '音声ファイルを選んでください。', 'error');
    return;
  }
  setStatus('a-status', 'ブラウザ内で解析しています…');
  try {
    const r = await analyzeLocally(file);
    setStatus(
      'a-status',
      `推定テンポ:約 ${r.tempo?.bpm ?? '?'} BPM(倍・半分なら約 ${r.tempo?.alternative ?? '?'} BPM)\n` +
        `推定キー:${r.key.key}(次点:${r.key.runnerUp})\n曲の長さ:${r.durationSec} 秒\n` +
        '※ 簡易推定です。倍テン・半テンや平行調との取り違えが起こり得ます。',
      'ok',
    );
  } catch (err) {
    setStatus('a-status', `この音声ファイルは読み込めませんでした(${err.message})。mp3 か wav でお試しください。`, 'error');
  }
}

// ---------- コピペモード ----------
function pastePromptFor(kind) {
  if (kind === 'hooks') {
    const input = composeInput();
    if (!requireText(input.message, '「伝えたいメッセージ」を入力してください。', 'c-status')) return null;
    state.lastComposeInput = input;
    return P.buildPastePrompt(P.systemForHooks(), P.userForHooks(input), HOOKS_SCHEMA);
  }
  if (kind === 'compose') {
    const input = composeInput();
    if (!requireText(input.message, '「伝えたいメッセージ」を入力してください。', 'c-status')) return null;
    state.lastComposeInput = input;
    return P.buildPastePrompt(P.systemForCompose(), P.userForCompose(input), SONG_SCHEMA);
  }
  if (kind === 'enhance') {
    const input = enhanceInput();
    if (!requireText(input.lyrics, '補強したい歌詞を貼り付けてください。', 'e-status')) return null;
    return P.buildPastePrompt(P.systemForEnhance(), P.userForEnhance(input), ENHANCE_SCHEMA);
  }
  if (kind === 'analyze') {
    return P.buildPastePrompt(
      P.systemForAnalysis(),
      P.userForAnalysis({ title: $('a-title').value.trim(), notes: $('a-notes').value.trim() }) +
        '\n(楽曲の音声または YouTube の URL は、このメッセージと一緒に渡しています)',
      ANALYSIS_SCHEMA,
    );
  }
  return null;
}

function loadPasted(textareaId, statusId, handler) {
  try {
    handler(extractJson($(textareaId).value));
    setStatus(statusId, '');
    toast('読み込みました');
  } catch (err) {
    setStatus(statusId, err.message, 'error');
  }
}

// ---------- 結果の表示 ----------
function showHooks(result) {
  state.hooks = result;
  const cards = (result.candidates || [])
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map(
      (c, i) => `
      <article class="card">
        <h4><span>${esc(c.label)}</span><span class="score">${esc(c.score)}/10</span></h4>
        <p class="meta">切り口:${esc(c.angle)}<br />視点:${esc(c.pov)}</p>
        <pre>[Verse]\n${esc(c.verse)}</pre>
        <pre>[Chorus]\n${esc(c.chorus)}</pre>
        <p class="hook">♪ ${esc(c.hook_line)}</p>
        <p class="meta">${esc(c.why)}</p>
        <button class="primary ghost" data-expand="${i}">この案をフル尺に仕上げる</button>
      </article>`,
    );
  const sorted = (result.candidates || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  state.hooks.sorted = sorted;
  $('hooks-result').innerHTML = `
    <h3>Aメロ+サビの候補(${sorted.length}案・スコア順)</h3>
    <p class="meta">核:${esc(result.core_message)}</p>
    <div class="cards">${cards.join('')}</div>
    <div class="recommend"><b>おすすめ:</b>${esc(result.recommendation)}</div>`;
}

function showChanges(changes) {
  if (!changes?.length) {
    $('changes-result').innerHTML = '';
    return;
  }
  $('changes-result').innerHTML = `
    <h3>主な変更点</h3>
    <div class="table-scroll"><table class="changes">
      <thead><tr><th>元の歌詞</th><th>補強後</th><th>理由</th></tr></thead>
      <tbody>${changes
        .map((c) => `<tr><td>${esc(c.before)}</td><td>${esc(c.after)}</td><td>${esc(c.reason)}</td></tr>`)
        .join('')}</tbody>
    </table></div>
    <p class="hint">完成版は「④ Suno に貼る」タブに入っています。</p>`;
}

function setAnalysis(a, local) {
  state.analysis = { ...a, local };
  store.set('analysis', state.analysis);
  renderAnalysis();
  $('c-use-ref').checked = true;
  $('e-use-ref').checked = true;
}

function renderAnalysis() {
  const a = state.analysis;
  if (!a) return;
  const list = (arr) => esc((arr || []).join(', '));
  const rows = [
    ['推定した曲', esc(a.identified_as)],
    ['ジャンル', `${esc(a.genre)}<br /><small>${list(a.subgenres)}</small>`],
    ['年代感', esc(a.era_feel)],
    ['テンポ', esc(a.bpm_estimate) + (a.local?.tempo ? `<br /><small>ブラウザ内推定:約 ${a.local.tempo.bpm} BPM</small>` : '')],
    ['キー', esc(a.key_estimate) + (a.local?.key ? `<br /><small>ブラウザ内推定:${esc(a.local.key.key)}</small>` : '')],
    ['拍子', esc(a.time_signature)],
    ['ムード', list(a.mood)],
    ['エネルギーの流れ', esc(a.energy_curve)],
    ['楽器・音色', list(a.instrumentation)],
    ['ボーカル', esc([a.vocal?.gender, a.vocal?.timbre, a.vocal?.delivery, a.vocal?.range].filter(Boolean).join(' / '))],
    ['音作り', list(a.production)],
    ['構成', (a.structure || []).map((s) => `<b>${esc(s.section)}</b>:${esc(s.description)}`).join('<br />')],
    ['フックの仕掛け', (a.hook_devices || []).map(esc).join('<br />')],
    ['歌詞のテーマ', list(a.lyric_themes)],
    ['言葉の詰め方', esc(a.syllable_density)],
    ['刺さる理由', (a.psych_highlights || []).map(esc).join('<br />')],
  ];
  $('analysis-result').innerHTML = `
    <div class="analysis">
      <h3>分析結果</h3>
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v || '—'}</dd>`).join('')}</dl>
      <div class="copy-field">
        <div class="copy-head"><span>この要素の Suno Style</span><button id="a-copy-style">コピー</button></div>
        <textarea id="a-style" rows="3" readonly>${esc(a.suno_style)}</textarea>
      </div>
      <p class="hint">Exclude:${esc(a.exclude_styles)}</p>
      <div class="warn-box">${esc(a.caution)}</div>
      <p class="hint">この分析は ① ② の「参考にする」にチェックを入れると、曲作りに反映されます(歌詞やメロディはコピーしません)。</p>
    </div>`;
  $('a-copy-style').onclick = () => copyText(a.suno_style);
}

function setSong(song, source) {
  const clean = {
    ...song,
    title: String(song.title || '').trim(),
    style: normalizeStyle(song.style),
    exclude_styles: normalizeStyle(song.exclude_styles),
    lyrics: normalizeLyrics(song.lyrics),
    source,
    createdAt: new Date().toISOString(),
  };
  state.song = clean;
  store.set('song', clean);
  const history = store.get('history', []);
  history.unshift(clean);
  store.set('history', history.slice(0, 30));
  renderSong();
  renderHistory();
  switchTab('output');
  toast('Suno 用の出力ができました');
}

function renderSong() {
  const s = state.song;
  $('song-empty').hidden = !!s;
  $('song-view').hidden = !s;
  if (!s) return;
  $('o-title-view').textContent = s.title;
  $('o-concept').textContent = [s.concept, s.core_message && `核:${s.core_message}`].filter(Boolean).join(' / ');
  const pov = s.pov || {};
  $('o-pov').innerHTML = [
    pov.narrator && `語り手:${pov.narrator}`,
    pov.addressee && `相手:${pov.addressee}`,
    pov.time && `時点:${pov.time}`,
    pov.place && `場所:${pov.place}`,
    pov.pronouns && `人称・時制:${pov.pronouns}`,
    (s.motifs || []).length && `モチーフ:${s.motifs.join('・')}`,
  ]
    .filter(Boolean)
    .map((t) => `<span>${esc(t)}</span>`)
    .join('');
  $('o-title').value = s.title;
  $('o-style').value = s.style;
  $('o-exclude').value = s.exclude_styles || '';
  $('o-lyrics').value = s.lyrics;
  updateCounts();
  $('o-psych').innerHTML = (s.psychology_notes || [])
    .map((n) => `<div class="psych"><b>${esc(n.technique)}</b>${esc(n.where)}<small>${esc(n.why)}</small></div>`)
    .join('');
  $('o-review').innerHTML = (s.self_review || []).map((t) => `<li>${esc(t)}</li>`).join('');
  $('o-next').innerHTML = (s.next_steps || []).map((t) => `<li>${esc(t)}</li>`).join('');
}

function currentEdited() {
  return {
    ...state.song,
    title: $('o-title').value.trim(),
    style: $('o-style').value.trim(),
    exclude_styles: $('o-exclude').value.trim(),
    lyrics: $('o-lyrics').value,
  };
}

function updateCounts() {
  const song = currentEdited();
  const setCount = (id, len, max) => {
    const el = $(id);
    el.textContent = `${len} / ${max} 文字`;
    el.classList.toggle('over', len > max);
  };
  setCount('o-style-count', song.style.length, LIMITS.style);
  setCount('o-lyrics-count', song.lyrics.length, LIMITS.lyrics);
  const warnings = lintSong(song);
  $('o-warnings').innerHTML = warnings.length
    ? `<div class="warn-box"><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`
    : '';
}

function saveEdits() {
  if (!state.song) return;
  state.song = currentEdited();
  store.set('song', state.song);
}

function renderHistory() {
  const history = store.get('history', []);
  $('history-view').innerHTML = history.length
    ? history
        .map(
          (h, i) => `
        <div class="history-item">
          <div><b>${esc(h.title)}</b><small>${esc(new Date(h.createdAt).toLocaleString('ja-JP'))}・${esc(h.source)}</small></div>
          <button class="sub" data-history="${i}">開く</button>
        </div>`,
        )
        .join('')
    : '<div class="empty">まだ履歴はありません。</div>';
}

function renderKnowledge() {
  $('rules-view').innerHTML = `<h3>制作ルール(毎回 AI に渡しています)</h3><div class="rules">${esc(CREATOR_RULES.trim())}</div>`;
  const areas = [...new Set(KNOWLEDGE.map((k) => k.area))];
  $('knowledge-view').innerHTML = areas
    .map(
      (area) => `
      <h3 class="kb-area">${esc(area)}</h3>
      ${KNOWLEDGE.filter((k) => k.area === area)
        .map(
          (k) => `
        <div class="kb">
          <p>${esc(k.claim)}<span class="conf">${esc(CONFIDENCE_LABEL[k.confidence])}</span></p>
          <p class="use">→ ${esc(k.action)}</p>
          <p class="src"><a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.cite)}</a></p>
        </div>`,
        )
        .join('')}`,
    )
    .join('');
}

// ---------- 設定 ----------
function loadSettingsForm() {
  const s = settings();
  $('s-claude-key').value = s.claudeKey || '';
  $('s-claude-model').value = s.claudeModel;
  $('s-claude-effort').value = s.claudeEffort;
  $('s-gemini-key').value = s.geminiKey || '';
  $('s-gemini-model').value = s.geminiModel;
}

function saveSettingsForm() {
  store.set('settings', {
    claudeKey: $('s-claude-key').value.trim(),
    claudeModel: $('s-claude-model').value.trim() || DEFAULTS.claudeModel,
    claudeEffort: $('s-claude-effort').value,
    geminiKey: $('s-gemini-key').value.trim(),
    geminiModel: $('s-gemini-model').value.trim() || DEFAULTS.geminiModel,
  });
  toast('設定を保存しました');
}

// ---------- イベント ----------
function bind() {
  document.querySelectorAll('[role=tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  document.querySelectorAll('[data-run]').forEach((b) =>
    b.addEventListener('click', () => {
      const run = { hooks: runHooks, compose: () => runCompose(), enhance: runEnhance, analyze: runAnalyze }[b.dataset.run];
      run?.();
    }),
  );

  document.querySelectorAll('[data-copy-prompt]').forEach((b) =>
    b.addEventListener('click', () => {
      const text = pastePromptFor(b.dataset.copyPrompt);
      if (text) {
        copyText(text);
        b.closest('.panel').querySelector('details.paste').open = true;
      }
    }),
  );

  $('c-paste-load').onclick = () =>
    loadPasted('c-paste', 'c-status', (data) => {
      if (Array.isArray(data.candidates)) showHooks(data);
      else setSong(data, 'Claude(コピペ)');
    });
  $('e-paste-load').onclick = () =>
    loadPasted('e-paste', 'e-status', (data) => {
      showChanges(data.changes);
      setSong(data, 'Gemini(コピペ)');
    });
  $('a-paste-load').onclick = () => loadPasted('a-paste', 'a-status', (data) => setAnalysis(data, null));
  $('a-local').onclick = runLocalOnly;

  $('hooks-result').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-expand]');
    if (!btn) return;
    const candidate = state.hooks.sorted[Number(btn.dataset.expand)];
    if (settings().claudeKey) {
      runCompose(candidate);
    } else {
      const input = state.lastComposeInput || composeInput();
      copyText(P.buildPastePrompt(P.systemForCompose(), P.userForExpand(input, candidate), SONG_SCHEMA));
      setStatus('c-status', 'APIキーがないため、フル尺用のプロンプトをコピーしました。claude.ai に貼り、返答を下の欄で読み込んでください。', 'ok');
    }
  });

  ['o-title', 'o-style', 'o-exclude', 'o-lyrics'].forEach((id) =>
    $(id).addEventListener('input', () => {
      updateCounts();
      saveEdits();
    }),
  );
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText($(b.dataset.copy).value)));
  $('o-copy-all').onclick = () => copyText(toCopyBlock(currentEdited()));
  $('o-to-enhance').onclick = () => {
    $('e-lyrics').value = $('o-lyrics').value;
    $('e-message').value = state.song?.core_message || '';
    switchTab('enhance');
  };
  $('o-download').onclick = () => {
    const song = currentEdited();
    const blob = new Blob([toCopyBlock(song)], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${song.title || 'song'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $('history-view').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-history]');
    if (!btn) return;
    state.song = store.get('history', [])[Number(btn.dataset.history)];
    store.set('song', state.song);
    renderSong();
    switchTab('output');
  });

  $('s-save').onclick = saveSettingsForm;
  $('s-clear').onclick = () => {
    const s = store.get('settings', {});
    delete s.claudeKey;
    delete s.geminiKey;
    store.set('settings', s);
    loadSettingsForm();
    toast('APIキーを削除しました');
  };
}

function init() {
  $('rights-banner').innerHTML =
    `<b>商用利用の注意:</b>${esc(SUNO_RIGHTS_NOTE.text)} ` +
    `<a href="${SUNO_RIGHTS_NOTE.url}" target="_blank" rel="noopener">Suno 公式ヘルプ</a>`;
  bind();
  loadSettingsForm();
  renderKnowledge();
  renderSong();
  renderHistory();
  renderAnalysis();
  switchTab(store.get('tab', 'compose'));
}

init();
