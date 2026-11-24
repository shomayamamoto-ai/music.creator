// 画面の動きをまとめたファイル。
import { callClaude, callGemini, extractJson, LlmError } from './llm.js';
import * as P from './prompts.js';
import {
  SONG_SCHEMA,
  ENHANCE_SCHEMA,
  HOOKS_SCHEMA,
  ANALYSIS_SCHEMA,
  REVIEW_SCHEMA,
  PROFILE_SCHEMA,
  FEEDBACK_SCHEMA,
  LYRIC_STYLE_SCHEMA,
  LINE_SCHEMA,
  STYLE_VARIANTS_SCHEMA,
  PREFERENCE_SCHEMA,
  RELEASE_SCHEMA,
} from './schemas.js';
import { analyzeLyrics } from './mora.js';
import { LIMITS, lintSong, lintLyricsQuality, normalizeLyrics, normalizeStyle, toCopyBlock } from './suno.js';
import { analyzeLocally, fileToBase64 } from './audio.js';
import { aggregateStats, lyricStats } from './lyricstats.js';
import { KNOWLEDGE, CONFIDENCE_LABEL, CREATOR_RULES, SUNO_RIGHTS_NOTE } from './knowledge.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Math.random().toString(36).slice(2, 10);

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
};

const DEFAULTS = {
  claudeModel: 'claude-opus-5-5',
  claudeEffort: 'high',
  geminiModel: 'gemini-3.1-pro-preview',
  autoReview: true,
};
const settings = () => ({ ...DEFAULTS, ...store.get('settings', {}) });

const MAX_REFS = 8;
const MAX_HISTORY = 100;
const MAX_LYRICS = 20;
const MAX_INLINE_MB = 15; // Gemini はリクエスト全体で20MBまで(base64で約1.33倍になるため余裕を持たせる)

const state = {
  song: store.get('song', null),
  lastAnalysis: store.get('analysis', null),
  refs: store.get('refs', []),
  profile: store.get('profile', null),
  lyricItems: store.get('lyrics', []),
  lyricStyle: store.get('lyricStyle', null),
  useLyricStyle: store.get('useLyricStyle', true),
  preference: store.get('preference', null),
  usePreference: store.get('usePreference', true),
  variants: null,
  selectedLine: null,
  hooks: null,
  lastComposeInput: null,
  lastFeedback: null,
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

function switchTab(name, { scroll = true } = {}) {
  document.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  store.set('tab', name);
  if (name === 'feedback') renderFeedbackHeader();
  if (name === 'release') renderReleaseHeader();
  // スマホでは選んだタブが見える位置までタブ列を送る
  document.querySelector(`[role=tab][data-tab="${name}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  if (scroll) {
    const top = document.querySelector('.shell').getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }
}

let busy = false;
async function withBusy(statusId, label, fn) {
  if (busy) return;
  busy = true;
  const buttons = document.querySelectorAll('button[data-run]');
  buttons.forEach((b) => (b.disabled = true));
  const started = Date.now();
  let chars = 0;
  let currentLabel = label;
  const tick = setInterval(() => {
    const sec = Math.round((Date.now() - started) / 1000);
    setStatus(statusId, `${currentLabel}(${sec}秒経過${chars ? `・${chars}文字受信` : '・考え中'})`);
  }, 500);
  try {
    setStatus(statusId, `${label}…`);
    await fn(
      (n) => (chars = n),
      (newLabel) => {
        currentLabel = newLabel;
        chars = 0;
      },
    );
    setStatus(statusId, '');
  } catch (err) {
    console.error(err);
    setStatus(statusId, err.message || String(err), 'error');
  } finally {
    clearInterval(tick);
    buttons.forEach((b) => (b.disabled = false));
    busy = false;
  }
}

// ---------- AI 呼び出しの共通化 ----------
function claude(system, user, schema, onProgress) {
  const s = settings();
  return callClaude({ apiKey: s.claudeKey, model: s.claudeModel, effort: s.claudeEffort, system, user, schema, onProgress });
}

function gemini(system, parts, schema, onProgress) {
  const s = settings();
  return callGemini({ apiKey: s.geminiKey, model: s.geminiModel, system, parts, schema, onProgress });
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

function analysisToText(a) {
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

// 参考にする要素:共通点プロファイルがあればそれを、なければ選択中の参考曲を使う
function referenceText() {
  const p = state.profile;
  if (p) {
    return [
      `参考曲群の要約:${p.summary}`,
      `共通する定番:${(p.common_traits || []).join(' / ')}`,
      `テンポの範囲:${p.tempo_range}`,
      `構成の型:${p.structure_template}`,
      `フックの作り方:${(p.hook_patterns || []).join(' / ')}`,
      `ボーカル:${p.vocal_direction}`,
      `土台にする Style:${p.blended_style}`,
    ].join('\n');
  }
  const selected = state.refs.filter((r) => r.selected);
  const list = selected.length ? selected : state.lastAnalysis ? [state.lastAnalysis] : [];
  return list.map((a, i) => `## 参考曲${i + 1}\n${analysisToText(a)}`).join('\n\n');
}

function requireText(value, msg, statusId) {
  if (!value) {
    setStatus(statusId, msg, 'error');
    return false;
  }
  return true;
}

// ---------- 学習した作詞スタイル ----------
function styleToText(st) {
  if (!st) return '';
  return [
    `要約:${st.summary}`,
    `1行の長さ:${st.line_length}`,
    `言葉の詰め方(1音符に複数音):${st.packing}`,
    `ハモリ・コーラス:${st.layering}`,
    `繰り返し:${st.repetition}`,
    `韻・リズム:${st.rhyme}`,
    `語彙:${st.vocabulary}`,
    `人称・視点:${st.pov}`,
    `描写:${st.imagery}`,
    `守る:${(st.do_list || []).join(' / ')}`,
    `避ける:${(st.dont_list || []).join(' / ')}`,
  ].join('\n');
}

function applyLearnedStyle() {
  P.setLearnedStyle(state.useLyricStyle ? styleToText(state.lyricStyle) : '');
}

function preferenceToText(p) {
  if (!p) return '';
  return [
    `要約:${p.summary}`,
    `好まれる特徴:${(p.liked_patterns || []).join(' / ')}`,
    `好まれない特徴:${(p.disliked_patterns || []).join(' / ')}`,
    `音の好み:${p.style_preferences}`,
    `歌詞の好み:${p.lyric_preferences}`,
    `優先すること:${(p.do_list || []).join(' / ')}`,
    `避けること:${(p.avoid_list || []).join(' / ')}`,
  ].join('\n');
}

function applyPreference() {
  P.setPreference(state.usePreference ? preferenceToText(state.preference) : '');
}

// ---------- 評価(★) ----------
function ratedSongs() {
  const seen = new Set();
  return store
    .get('history', [])
    .filter((h) => h.rating)
    .filter((h) => {
      const key = `${h.songId}:${h.version}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function syncHistoryEntry(song) {
  const history = store.get('history', []);
  const i = history.findIndex((h) => h.createdAt === song.createdAt);
  if (i >= 0) {
    history[i] = { ...history[i], rating: song.rating, ratingNote: song.ratingNote, adoptedVariant: song.adoptedVariant, project: song.project };
    store.set('history', history);
  }
}

function setRating(n) {
  if (!state.song) return;
  saveEdits();
  state.song.rating = n;
  store.set('song', state.song);
  syncHistoryEntry(state.song);
  renderStars();
  renderHistory();
  renderPrefCount();
  toast(`★${n} を付けました`);
}

function renderStars() {
  const r = state.song?.rating || 0;
  document.querySelectorAll('#o-rating [data-star]').forEach((b) => {
    const on = Number(b.dataset.star) <= r;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(Number(b.dataset.star) === r));
  });
  $('o-rating-note').value = state.song?.ratingNote || '';
}

async function runPreference() {
  const rated = ratedSongs();
  if (rated.length < 3) {
    setStatus('pref-status', `★を付けた曲が ${rated.length} 曲です。STEP 4 で3曲以上に★を付けてください。`, 'error');
    return;
  }
  await withBusy('pref-status', `Gemini が ${rated.length} 曲の評価から好みを学習しています`, async (onProgress) => {
    setPreferenceResult(await gemini(P.systemForPreference(), [{ text: P.userForPreference(rated, rated.map((r) => lyricStats(r.lyrics))) }], PREFERENCE_SCHEMA, onProgress));
  });
}

function setPreferenceResult(p) {
  state.preference = { ...p, learnedAt: new Date().toISOString(), basedOn: ratedSongs().length };
  state.usePreference = true;
  store.set('preference', state.preference);
  store.set('usePreference', true);
  applyPreference();
  renderPreference();
  updateChrome();
}

function renderPrefCount() {
  const rated = ratedSongs();
  const high = rated.filter((r) => r.rating >= 4).length;
  const low = rated.filter((r) => r.rating <= 2).length;
  $('pref-count').innerHTML = `★を付けた曲:<b>${rated.length}曲</b>(高評価 ${high}・低評価 ${low})`;
}

function renderPreference() {
  renderPrefCount();
  const p = state.preference;
  if (!p) {
    $('pref-result').innerHTML = '';
    return;
  }
  $('pref-result').innerHTML = `
    <div class="analysis">
      <h3>学習した好み ${state.usePreference ? '<span class="agree yes">作詞と Style に反映中</span>' : '<span class="agree no">反映していません</span>'}</h3>
      <p>${esc(p.summary)}</p>
      <dl>
        <dt>好まれる特徴</dt><dd>${(p.liked_patterns || []).map(esc).join('<br />')}</dd>
        <dt>好まれない特徴</dt><dd>${(p.disliked_patterns || []).map(esc).join('<br />')}</dd>
        <dt>音の好み</dt><dd>${esc(p.style_preferences)}</dd>
        <dt>歌詞の好み</dt><dd>${esc(p.lyric_preferences)}</dd>
        <dt>優先すること</dt><dd>${(p.do_list || []).map(esc).join('<br />')}</dd>
        <dt>避けること</dt><dd>${(p.avoid_list || []).map(esc).join('<br />')}</dd>
      </dl>
      <p class="hint">${esc(p.confidence)}(${p.basedOn ?? '?'}曲の評価に基づく)</p>
    </div>`;
}

// ---------- Style の3案比較 ----------
async function runVariants() {
  if (!state.song) return;
  saveEdits();
  await withBusy('v-status', 'Gemini が Style を3案作っています', async (onProgress) => {
    showVariants(await gemini(P.systemForStyleVariants(), [{ text: P.userForStyleVariants(state.song, $('c-use-ref').checked ? referenceText() : '') }], STYLE_VARIANTS_SCHEMA, onProgress));
  });
}

function showVariants(data) {
  state.variants = data.variants || [];
  $('variants-result').innerHTML = `
    <p class="hint">3案をそれぞれ Suno で生成して聴き比べ、良かった案を「採用」してください。採用した案は好みの学習にも使われます。</p>
    <div class="variants">${state.variants
      .map(
        (v, i) => `
      <div class="variant ${state.song?.adoptedVariant === v.name ? 'adopted' : ''}">
        <h4>${esc(v.name)}</h4>
        <p>${esc(v.intent)}</p>
        <div class="vstyle">${esc(v.style)}</div>
        ${v.exclude_styles ? `<p class="listen">Exclude:${esc(v.exclude_styles)}</p>` : ''}
        <p class="listen">聴き比べのポイント:${esc(v.listen_for)}</p>
        <div class="row">
          <button class="sub" data-variant-copy="${i}">Style をコピー</button>
          <button class="primary ghost" data-variant-adopt="${i}">この案を採用</button>
        </div>
      </div>`,
      )
      .join('')}</div>`;
}

// ---------- 歌詞の分析ビューと1行の書き直し ----------
function renderLyricView() {
  if (!$('o-lyric-wrap').open) return;
  const a = analyzeLyrics($('o-lyrics').value);
  state.lyricAnalysis = a;
  const label = { verse: 'Aメロ', pre: 'Bメロ', chorus: 'サビ', bridge: 'Cメロ' };
  const summary = Object.entries(a.summary)
    .filter(([k]) => label[k])
    .map(([k, v]) => `<span>${label[k]} 平均 約${v}音/行</span>`)
    .join('');
  const verse = a.summary.verse;
  const chorus = a.summary.chorus;
  const densityNote =
    verse && chorus
      ? chorus < verse
        ? '<span>サビはAメロより言葉が少なめ(覚えやすい形)</span>'
        : '<span>サビの言葉がAメロ以上に多め。詰まりすぎていないか確認</span>'
      : '';
  let html = `<div class="lv-summary">${summary}${densityNote}${a.rhymeRate != null ? `<span>隣の行と語尾の母音が揃う割合 ${a.rhymeRate}%</span>` : ''}</div>
    <p class="hint">行を押すと、その1行だけ AI が書き直し案を3つ出します(音数は元の行に近づけます)。漢字・英語を含む行の音数は概算です。</p>`;
  let current = '';
  for (const l of a.lines) {
    if (l.section !== current) {
      current = l.section;
      html += `<p class="lv-sec">${esc(current)}</p>`;
    }
    const long = l.mora > 20;
    html += `<button type="button" class="lv-line ${state.selectedLine === l.index ? 'sel' : ''}" data-line="${l.index}">
        <span class="t">${esc(l.text)}</span>
        <span class="lv-mora ${long ? 'long' : ''}">${l.approx ? '約' : ''}${l.mora}音</span>
        <span class="lv-vowel ${l.vowel ? `v-${l.vowel}` : ''}">${l.vowel ? l.vowel.toUpperCase() : '–'}</span>
      </button>`;
    if (state.selectedLine === l.index) {
      html += `<div class="lv-rewrite" id="lv-rewrite">
          <label class="field"><span>どう直したいか(任意)</span><input id="lv-wish" placeholder="例:もっと具体的に/語尾を「い」で揃えたい" /></label>
          <div class="actions"><button class="primary ghost" id="lv-go">この行の書き直し案を出す(Claude)</button></div>
          <div id="lv-options"></div>
        </div>`;
    }
  }
  $('o-lyric-view').innerHTML = html || '<p class="hint">歌詞がありません。</p>';
}

async function runLineRewrite() {
  const a = state.lyricAnalysis;
  const line = a?.lines.find((l) => l.index === state.selectedLine);
  if (!line) return;
  saveEdits();
  const wish = $('lv-wish').value.trim();
  if (!settings().claudeKey) {
    copyText(P.buildPastePrompt(P.systemForLineRewrite(), P.userForLineRewrite(state.song, line, wish), LINE_SCHEMA));
    setStatus('lr-status', 'APIキーがないため、書き直し用のプロンプトをコピーしました。claude.ai に貼って、気に入った案を歌詞欄に直接貼ってください。', 'ok');
    return;
  }
  await withBusy('lr-status', 'Claude が1行の書き直し案を考えています', async (onProgress) => {
    const res = await claude(P.systemForLineRewrite(), P.userForLineRewrite(state.song, line, wish), LINE_SCHEMA, onProgress);
    $('lv-options').innerHTML = (res.options || [])
      .map((o) => `<button type="button" class="lv-opt" data-opt="${esc(o.text)}"><b>${esc(o.text)}</b><small>${esc(o.why)}</small></button>`)
      .join('');
  });
}

function replaceLine(index, text) {
  const lines = $('o-lyrics').value.split('\n');
  if (index < 0 || index >= lines.length) return;
  lines[index] = text;
  $('o-lyrics').value = lines.join('\n');
  saveEdits();
  updateCounts();
  state.selectedLine = null;
  renderLyricView();
  toast('1行を差し替えました');
}

// ---------- STEP 2 量産・1曲・全自動 ----------
async function doHooks(input, onProgress) {
  return claude(P.systemForHooks(), P.userForHooks(input), HOOKS_SCHEMA, onProgress);
}

async function doCompose(input, candidate, onProgress) {
  return claude(
    P.systemForCompose(),
    candidate ? P.userForExpand(input, candidate) : P.userForCompose(input),
    SONG_SCHEMA,
    onProgress,
  );
}

async function doReview(song, onProgress) {
  const warnings = lintLyricsQuality(song);
  return claude(P.systemForReview(), P.userForReview(song, warnings), REVIEW_SCHEMA, onProgress);
}

async function runHooks() {
  const input = composeInput();
  if (!requireText(input.message, '「伝えたいメッセージ」を入力してください。', 'c-status')) return;
  state.lastComposeInput = input;
  await withBusy('c-status', `Claude が ${input.count} 案を作っています`, async (onProgress) => {
    showHooks(await doHooks(input, onProgress));
  });
}

async function runCompose(candidate) {
  const input = candidate && state.lastComposeInput ? state.lastComposeInput : composeInput();
  if (!requireText(input.message, '「伝えたいメッセージ」を入力してください。', 'c-status')) return;
  state.lastComposeInput = input;
  await withBusy('c-status', 'Claude が1曲に仕上げています', async (onProgress, relabel) => {
    let song = await doCompose(input, candidate, onProgress);
    if (settings().autoReview) {
      relabel('Claude が厳しく推敲しています');
      try {
        song = await doReview(song, onProgress);
      } catch (err) {
        toast('推敲に失敗したため、推敲前の版を表示します');
      }
    }
    setSong(song, 'Claude');
  });
}

const PIPELINE = [
  ['hooks', 'Aメロ+サビを量産(Claude)'],
  ['pick', '最高得点の案を選ぶ'],
  ['expand', 'フル尺に仕上げる(Claude)'],
  ['review', '厳しく推敲する(Claude)'],
  ['enhance', '補強と Style の仕上げ(Gemini)'],
];

function setPipeline(key, cls, note) {
  const li = document.querySelector(`#pipeline [data-step="${key}"]`);
  if (!li) return;
  li.className = cls;
  if (note) li.querySelector('small').textContent = note;
}

async function runAuto() {
  const input = composeInput();
  if (!requireText(input.message, '「伝えたいメッセージ」を入力してください。', 'c-status')) return;
  const s = settings();
  if (!s.claudeKey) {
    setStatus('c-status', '全自動には Claude の APIキーが必要です。「設定」タブで入力するか、下の「APIキーなしで使う」を開いてください。', 'error');
    return;
  }
  state.lastComposeInput = input;
  const pl = $('pipeline');
  pl.hidden = false;
  pl.innerHTML = PIPELINE.map(([k, label]) => `<li data-step="${k}"><span>${label}</span><small class="hint"></small></li>`).join('');
  let stepKey = 'hooks';
  await withBusy('c-status', '全自動で作っています:案を量産中', async (onProgress, relabel) => {
    try {
      setPipeline('hooks', 'run');
      const hooks = await doHooks(input, onProgress);
      showHooks(hooks);
      setPipeline('hooks', 'done', `${hooks.candidates?.length ?? 0}案`);

      stepKey = 'pick';
      const best = state.hooks.sorted[0];
      if (!best) throw new LlmError('案が1つも返ってきませんでした。もう一度お試しください。');
      setPipeline('pick', 'done', `${best.label}(${best.score}/10)`);

      stepKey = 'expand';
      setPipeline('expand', 'run');
      relabel('全自動で作っています:フル尺に仕上げ中');
      let song = await doCompose(input, best, onProgress);
      setPipeline('expand', 'done');

      stepKey = 'review';
      setPipeline('review', 'run');
      relabel('全自動で作っています:推敲中');
      try {
        song = await doReview(song, onProgress);
        const low = (song.critique || []).filter((c) => c.score < 8).length;
        setPipeline('review', 'done', low ? `8点未満 ${low}項目を改稿` : '全項目8点以上');
      } catch (err) {
        setPipeline('review', 'fail', '失敗したため推敲前の版で続行');
      }

      stepKey = 'enhance';
      if (s.geminiKey) {
        setPipeline('enhance', 'run');
        relabel('全自動で作っています:Gemini で補強中');
        try {
          const enhanced = await gemini(
            P.systemForEnhance(),
            [{ text: P.userForEnhance({ lyrics: song.lyrics, message: song.core_message, genre: input.genre, strength: '弱(Style 作成とタグ整理が中心。歌詞はほぼそのまま)', extra: input.extra, reference: input.reference }) }],
            ENHANCE_SCHEMA,
            onProgress,
          );
          // Claude の採点表は残し、Gemini の補強結果で上書きする
          song = { ...song, ...enhanced };
          showChanges(enhanced.changes);
          setPipeline('enhance', 'done');
        } catch (err) {
          setPipeline('enhance', 'fail', `${err.message}(Claude の版で完成)`);
        }
      } else {
        setPipeline('enhance', 'skip', 'Gemini の APIキーがないため省略');
      }
      setSong(song, '全自動');
    } catch (err) {
      setPipeline(stepKey, 'fail', err.message);
      throw err;
    }
  });
}

// ---------- STEP 3 補強 ----------
async function runEnhance() {
  const input = enhanceInput();
  if (!requireText(input.lyrics, '補強したい歌詞を貼り付けてください。', 'e-status')) return;
  await withBusy('e-status', 'Gemini が歌詞を補強しています', async (onProgress) => {
    const song = await gemini(P.systemForEnhance(), [{ text: P.userForEnhance(input) }], ENHANCE_SCHEMA, onProgress);
    showChanges(song.changes);
    setSong(song, 'Gemini', { revision: isSameSong(input.lyrics) });
  });
}

function isSameSong(lyrics) {
  return !!state.song && normalizeLyrics(state.song.lyrics) === normalizeLyrics(lyrics);
}

// ---------- STEP 4 推敲 ----------
async function runReview() {
  if (!state.song) return;
  saveEdits();
  await withBusy('r-status', 'Claude が厳しく推敲しています', async (onProgress) => {
    setSong(await doReview(state.song, onProgress), 'Claude 推敲', { revision: true });
  });
}

// ---------- STEP 1 分析・ライブラリ・学習 ----------
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
    const result = await gemini(P.systemForAnalysis(), parts, ANALYSIS_SCHEMA, onProgress);
    setAnalysis(result, local, title || file?.name || youtube);
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

async function runProfile() {
  const selected = state.refs.filter((r) => r.selected);
  if (selected.length < 2) {
    setStatus('p-status', '参考曲ライブラリから2曲以上を選んでください。', 'error');
    return;
  }
  await withBusy('p-status', `Gemini が ${selected.length} 曲の共通点を抽出しています`, async (onProgress) => {
    setProfile(await gemini(P.systemForProfile(), [{ text: P.userForProfile(selected) }], PROFILE_SCHEMA, onProgress));
  });
}

function selectedLyrics() {
  return state.lyricItems.filter((l) => l.selected);
}

async function runLearn() {
  const items = selectedLyrics();
  if (!items.length) {
    setStatus('l-status', '学習させる歌詞を1曲以上取り込んで、チェックを入れてください。', 'error');
    return;
  }
  const stats = aggregateStats(items);
  await withBusy('l-status', `Gemini が ${items.length} 曲の書き方を学習しています`, async (onProgress) => {
    setLyricStyle(await gemini(P.systemForLyricStyle(), [{ text: P.userForLyricStyle(items, stats) }], LYRIC_STYLE_SCHEMA, onProgress), stats);
  });
}

// ---------- STEP 5 聴いて直す ----------
const SYMPTOMS = [
  'イントロが長い・始まりが遅い',
  '声の雰囲気が違う',
  '歌詞の読み間違いがある',
  '言葉が詰まって聞き取れない',
  '1音が伸びすぎ・間延びする',
  'サビが盛り上がらない',
  '音がごちゃごちゃしている',
  '音が薄い・地味',
  'テンポが想像と違う',
  'ジャンル・雰囲気が違う',
  '構成が崩れた(サビがない等)',
  '終わり方が不自然',
];

function feedbackInput() {
  return {
    symptoms: [...document.querySelectorAll('#f-symptoms input:checked')].map((i) => i.value),
    comment: $('f-comment').value.trim(),
    file: $('f-file').files[0] || null,
  };
}

async function runFeedback() {
  if (!state.song) {
    setStatus('f-status', 'まだ曲がありません。STEP 2 か 3 で作るか、「履歴」から開いてください。', 'error');
    return;
  }
  saveEdits();
  const input = feedbackInput();
  if (!input.symptoms.length && !input.comment && !input.file) {
    setStatus('f-status', '気になったことを選ぶか、感想を書くか、音声を添付してください。', 'error');
    return;
  }
  if (input.file && input.file.size > MAX_INLINE_MB * 1024 * 1024) {
    setStatus('f-status', `音声ファイルが大きすぎます(${MAX_INLINE_MB}MB まで)。`, 'error');
    return;
  }
  await withBusy('f-status', input.file ? 'Gemini が生成された曲を聴いています' : 'Gemini が原因を調べています', async (onProgress) => {
    const parts = [];
    if (input.file) parts.push({ inlineData: { mimeType: input.file.type || 'audio/mpeg', data: await fileToBase64(input.file) } });
    parts.push({ text: P.userForFeedback(state.song, { ...input, hasAudio: !!input.file }) });
    showFeedback(await gemini(P.systemForFeedback(), parts, FEEDBACK_SCHEMA, onProgress));
  });
}

// ---------- コピペモード ----------
function pastePromptFor(kind) {
  if (kind === 'hooks' || kind === 'compose') {
    const input = composeInput();
    if (!requireText(input.message, '「伝えたいメッセージ」を入力してください。', 'c-status')) return null;
    state.lastComposeInput = input;
    return kind === 'hooks'
      ? P.buildPastePrompt(P.systemForHooks(), P.userForHooks(input), HOOKS_SCHEMA)
      : P.buildPastePrompt(P.systemForCompose(), P.userForCompose(input), SONG_SCHEMA);
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
  if (kind === 'review') {
    if (!state.song) return null;
    saveEdits();
    return P.buildPastePrompt(P.systemForReview(), P.userForReview(state.song, lintLyricsQuality(state.song)), REVIEW_SCHEMA);
  }
  if (kind === 'profile') {
    const selected = state.refs.filter((r) => r.selected);
    if (selected.length < 2) {
      setStatus('p-status', '参考曲ライブラリから2曲以上を選んでください。', 'error');
      return null;
    }
    return P.buildPastePrompt(P.systemForProfile(), P.userForProfile(selected), PROFILE_SCHEMA);
  }
  if (kind === 'learn') {
    const items = selectedLyrics();
    if (!items.length) {
      setStatus('l-status', '学習させる歌詞を1曲以上取り込んで、チェックを入れてください。', 'error');
      return null;
    }
    return P.buildPastePrompt(P.systemForLyricStyle(), P.userForLyricStyle(items, aggregateStats(items)), LYRIC_STYLE_SCHEMA);
  }
  if (kind === 'release') {
    if (!state.song) return null;
    saveEdits();
    return P.buildPastePrompt(P.systemForRelease(), P.userForRelease(state.song, releaseInput()), RELEASE_SCHEMA);
  }
  if (kind === 'variants') {
    if (!state.song) return null;
    saveEdits();
    return P.buildPastePrompt(P.systemForStyleVariants(), P.userForStyleVariants(state.song, ''), STYLE_VARIANTS_SCHEMA);
  }
  if (kind === 'preference') {
    const rated = ratedSongs();
    if (rated.length < 3) {
      setStatus('pref-status', `★を付けた曲が ${rated.length} 曲です。STEP 4 で3曲以上に★を付けてください。`, 'error');
      return null;
    }
    return P.buildPastePrompt(P.systemForPreference(), P.userForPreference(rated, rated.map((r) => lyricStats(r.lyrics))), PREFERENCE_SCHEMA);
  }
  if (kind === 'feedback') {
    if (!state.song) return null;
    saveEdits();
    const input = feedbackInput();
    return P.buildPastePrompt(
      P.systemForFeedback(),
      P.userForFeedback(state.song, { ...input, hasAudio: !!input.file }) +
        (input.file ? '\n(生成した曲の音声は、このメッセージと一緒に渡しています)' : ''),
      FEEDBACK_SCHEMA,
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
  const sorted = (result.candidates || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  state.hooks = { ...result, sorted };
  const cards = sorted.map(
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
    <p class="hint">完成版は「STEP 4 Suno に貼る」に入っています。</p>`;
}

function setAnalysis(a, local, label) {
  const entry = { ...a, local, id: uid(), label: label || a.identified_as, savedAt: new Date().toISOString(), selected: true };
  state.lastAnalysis = entry;
  store.set('analysis', entry);
  state.refs = [entry, ...state.refs].slice(0, MAX_REFS);
  store.set('refs', state.refs);
  renderAnalysis();
  renderLibrary();
  updateChrome();
  $('c-use-ref').checked = true;
  $('e-use-ref').checked = true;
}

// Gemini の推定とブラウザ内推定が一致しているかを表示(精度の目安)
function bpmAgreement(a) {
  const local = a.local?.tempo;
  const m = String(a.bpm_estimate || '').match(/(\d{2,3}(?:\.\d+)?)/);
  if (!local || !m) return '';
  const g = Number(m[1]);
  const ok = [local.bpm, local.alternative].some((b) => Math.abs(b - g) <= 4);
  return ok ? '<span class="agree yes">2つの推定が一致</span>' : '<span class="agree no">推定が食い違い・要確認</span>';
}

// "A minor" / "Am" / "A min" / "A♭ major" などを {主音, 長短} に揃える
function parseKey(text) {
  const m = String(text || '').match(/([A-G])\s*([#♯b♭]?)\s*(major|minor|maj|min|m(?![a-z]))?/i);
  if (!m) return null;
  const acc = { '♯': '#', '♭': 'b' }[m[2]] || m[2];
  const mode = /^m(in(or)?)?$/i.test(m[3] || '') ? 'minor' : 'major';
  return `${m[1].toUpperCase()}${acc} ${mode}`;
}

function keyAgreement(a) {
  const local = a.local?.key;
  const g = parseKey(a.key_estimate);
  if (!local || !g) return '';
  const ok = [local.key, local.runnerUp].some((k) => parseKey(k) === g);
  return ok ? '<span class="agree yes">2つの推定が一致</span>' : '<span class="agree no">推定が食い違い・要確認</span>';
}

function renderAnalysis() {
  const a = state.lastAnalysis;
  if (!a) return;
  const list = (arr) => esc((arr || []).join(', '));
  const rows = [
    ['推定した曲', esc(a.identified_as)],
    ['ジャンル', `${esc(a.genre)}<br /><small>${list(a.subgenres)}</small>`],
    ['年代感', esc(a.era_feel)],
    ['テンポ', esc(a.bpm_estimate) + bpmAgreement(a) + (a.local?.tempo ? `<br /><small>ブラウザ内推定:約 ${a.local.tempo.bpm} BPM(倍・半分:${a.local.tempo.alternative})</small>` : '')],
    ['キー', esc(a.key_estimate) + keyAgreement(a) + (a.local?.key ? `<br /><small>ブラウザ内推定:${esc(a.local.key.key)}(次点 ${esc(a.local.key.runnerUp)})</small>` : '')],
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
      <h3>分析結果:${esc(a.label || '')}</h3>
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v || '—'}</dd>`).join('')}</dl>
      <div class="copy-field">
        <div class="copy-head"><span>この要素の Suno Style</span><button id="a-copy-style">コピー</button></div>
        <textarea id="a-style" rows="3" readonly>${esc(a.suno_style)}</textarea>
      </div>
      <p class="hint">Exclude:${esc(a.exclude_styles)}</p>
      <div class="warn-box">${esc(a.caution)}</div>
      <p class="hint">STEP 2・3 の「参考にする」にチェックを入れると、曲作りに反映されます(歌詞やメロディはコピーしません)。</p>
    </div>`;
  $('a-copy-style').onclick = () => copyText(a.suno_style);
}

function renderLibrary() {
  $('ref-library').innerHTML = state.refs.length
    ? state.refs
        .map(
          (r) => `
      <div class="ref-item">
        <label><input type="checkbox" data-ref-select="${r.id}" ${r.selected ? 'checked' : ''} />
          <span><b>${esc(r.label)}</b><small>${esc(r.genre)}・${esc(r.bpm_estimate)}・${esc(r.key_estimate)}</small></span></label>
        <button class="sub" data-ref-show="${r.id}">表示</button>
        <button class="sub" data-ref-del="${r.id}">削除</button>
      </div>`,
        )
        .join('')
    : '<div class="empty">まだ参考曲がありません。上で分析すると追加されます。</div>';
}

function setProfile(p) {
  state.profile = p;
  store.set('profile', p);
  renderProfile();
  $('c-use-ref').checked = true;
  $('e-use-ref').checked = true;
}

function renderProfile() {
  const p = state.profile;
  if (!p) {
    $('profile-result').innerHTML = '';
    return;
  }
  $('profile-result').innerHTML = `
    <div class="analysis">
      <h3>ジャンルの定番プロファイル</h3>
      <p>${esc(p.summary)}</p>
      <dl>
        <dt>共通する定番</dt><dd>${(p.common_traits || []).map(esc).join('<br />')}</dd>
        <dt>各曲の個性</dt><dd>${(p.distinctive_choices || []).map(esc).join('<br />')}</dd>
        <dt>テンポの範囲</dt><dd>${esc(p.tempo_range)}</dd>
        <dt>構成の型</dt><dd>${esc(p.structure_template)}</dd>
        <dt>フックの作り方</dt><dd>${(p.hook_patterns || []).map(esc).join('<br />')}</dd>
        <dt>ボーカル</dt><dd>${esc(p.vocal_direction)}</dd>
      </dl>
      <div class="copy-field">
        <div class="copy-head"><span>土台にする Suno Style</span><button id="p-copy-style">コピー</button></div>
        <textarea rows="3" readonly>${esc(p.blended_style)}</textarea>
      </div>
      <div class="warn-box">${esc(p.caution)}</div>
      <div class="actions"><button class="sub" id="p-clear">このプロファイルを使わない</button></div>
      <p class="hint">「参考にする」にチェックを入れると、個別の参考曲よりこのプロファイルが優先されます。</p>
    </div>`;
  $('p-copy-style').onclick = () => copyText(p.blended_style);
  $('p-clear').onclick = () => {
    state.profile = null;
    store.set('profile', null);
    renderProfile();
    toast('プロファイルを外しました');
  };
}

function renderLyricLibrary() {
  $('lyric-library').innerHTML = state.lyricItems.length
    ? state.lyricItems
        .map((l) => {
          const lines = l.lyrics.split('\n').filter((x) => x.trim() && !/^\s*\[/.test(x)).length;
          return `
      <div class="ref-item">
        <label><input type="checkbox" data-lyric-select="${l.id}" ${l.selected ? 'checked' : ''} />
          <span><b>${esc(l.label)}</b><small>${lines}行</small></span></label>
        <button class="sub" data-lyric-del="${l.id}">削除</button>
      </div>`;
        })
        .join('')
    : '<div class="empty">まだ歌詞がありません。上の欄に貼って「歌詞を取り込む」を押してください。</div>';
}

function setLyricStyle(st, stats) {
  state.lyricStyle = { ...st, stats: stats ? { songs: stats.songs, mean_chars_per_line: stats.mean_chars_per_line, mean_packable_kana_percent: stats.mean_packable_kana_percent, mean_repeated_line_percent: stats.mean_repeated_line_percent } : null, learnedAt: new Date().toISOString() };
  state.useLyricStyle = true;
  store.set('lyricStyle', state.lyricStyle);
  store.set('useLyricStyle', true);
  applyLearnedStyle();
  renderLyricStyle();
  updateChrome();
}

function renderLyricStyle() {
  const st = state.lyricStyle;
  if (!st) {
    $('style-result').innerHTML = '';
    return;
  }
  const s = st.stats;
  $('style-result').innerHTML = `
    <div class="analysis">
      <h3>学習した書き方 ${state.useLyricStyle ? '<span class="agree yes">作詞に反映中</span>' : '<span class="agree no">反映していません</span>'}</h3>
      <p>${esc(st.summary)}</p>
      ${s ? `<p class="hint">集計:${s.songs}曲/1行平均 ${s.mean_chars_per_line} 文字/1音符にまとめやすい文字 ${s.mean_packable_kana_percent}%/繰り返し行 ${s.mean_repeated_line_percent}%</p>` : ''}
      <dl>
        <dt>1行の長さ</dt><dd>${esc(st.line_length)}</dd>
        <dt>言葉の詰め方</dt><dd>${esc(st.packing)}</dd>
        <dt>ハモリ・コーラス</dt><dd>${esc(st.layering)}</dd>
        <dt>繰り返し</dt><dd>${esc(st.repetition)}</dd>
        <dt>韻・リズム</dt><dd>${esc(st.rhyme)}</dd>
        <dt>語彙</dt><dd>${esc(st.vocabulary)}</dd>
        <dt>人称・視点</dt><dd>${esc(st.pov)}</dd>
        <dt>描写</dt><dd>${esc(st.imagery)}</dd>
        <dt>守る</dt><dd>${(st.do_list || []).map(esc).join('<br />')}</dd>
        <dt>避ける</dt><dd>${(st.dont_list || []).map(esc).join('<br />')}</dd>
      </dl>
    </div>`;
}

function showFeedback(fb) {
  state.lastFeedback = fb;
  $('feedback-result').innerHTML = `
    <h3>診断結果</h3>
    ${fb.heard && fb.heard !== '音声なし' ? `<div class="verdict"><b>聴き取れたこと:</b>${esc(fb.heard)}</div>` : ''}
    <div class="table-scroll"><table class="changes">
      <thead><tr><th>症状</th><th>原因</th><th>直し方</th></tr></thead>
      <tbody>${(fb.diagnosis || []).map((d) => `<tr><td>${esc(d.symptom)}</td><td>${esc(d.cause)}</td><td>${esc(d.fix)}</td></tr>`).join('')}</tbody>
    </table></div>
    <h4>変えてはいけない点</h4>
    <ul>${(fb.keep || []).map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
    <h4>次の生成で試すこと</h4>
    <ol>${(fb.try_next || []).map((k) => `<li>${esc(k)}</li>`).join('')}</ol>
    <div class="copy-field">
      <div class="copy-head"><span>修正版の Style</span></div>
      <textarea rows="3" readonly>${esc(fb.style)}</textarea>
    </div>
    <div class="actions"><button class="primary" id="f-apply">この修正版を STEP 4 に反映する(新しい版として保存)</button></div>`;
  $('f-apply').onclick = () => {
    const merged = { ...state.song, title: fb.title || state.song.title, style: fb.style, exclude_styles: fb.exclude_styles, lyrics: fb.lyrics || state.song.lyrics };
    setSong(merged, '聴いて直す', { revision: true });
  };
}

function renderFeedbackHeader() {
  const s = state.song;
  $('f-current').innerHTML = s
    ? `対象の曲:<b>${esc(s.title)}</b>(v${s.version || 1})。STEP 4 で書き換えた内容も反映されます。`
    : 'まだ曲がありません。STEP 2 か 3 で作るか、「履歴」から開いてください。';
}

// ---------- 曲の保存と表示 ----------
function setSong(song, source, { revision = false } = {}) {
  const prev = state.song;
  const clean = {
    ...song,
    title: String(song.title || '').trim(),
    style: normalizeStyle(song.style),
    exclude_styles: normalizeStyle(song.exclude_styles),
    lyrics: normalizeLyrics(song.lyrics),
    source,
    songId: revision && prev?.songId ? prev.songId : uid(),
    version: revision && prev ? (prev.version || 1) + 1 : 1,
    createdAt: new Date().toISOString(),
  };
  // プロジェクト名は版をまたいで引き継ぐ
  if (revision && prev?.project && !song.project) clean.project = prev.project;
  // 新しい版は未評価から始める
  delete clean.rating;
  delete clean.ratingNote;
  // 推敲以外の経路では古い採点表を持ち越さない
  if (!song.critique) {
    delete clean.critique;
    delete clean.verdict;
  }
  state.song = clean;
  store.set('song', clean);
  const history = store.get('history', []);
  history.unshift(clean);
  store.set('history', history.slice(0, MAX_HISTORY));
  renderSong();
  renderHistory();
  updateChrome();
  switchTab('output');
  toast(revision ? `v${clean.version} として保存しました` : 'Suno 用の出力ができました');
}

function renderSong() {
  const s = state.song;
  $('song-empty').hidden = !!s;
  $('song-view').hidden = !s;
  if (!s) return;
  $('o-title-view').innerHTML = `${esc(s.title)}<span class="version">v${s.version || 1}</span>`;
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
  $('o-project').value = s.project || '';
  $('o-style').value = s.style;
  $('o-exclude').value = s.exclude_styles || '';
  $('o-lyrics').value = s.lyrics;
  updateCounts();
  renderStars();
  renderCritique(s);
  state.selectedLine = null;
  renderLyricView();
  if (state.variants && $('variants-result').innerHTML) showVariants({ variants: state.variants });
  $('o-psych').innerHTML = (s.psychology_notes || [])
    .map((n) => `<div class="psych"><b>${esc(n.technique)}</b>${esc(n.where)}<small>${esc(n.why)}</small></div>`)
    .join('');
  $('o-review').innerHTML = (s.self_review || []).map((t) => `<li>${esc(t)}</li>`).join('');
  $('o-next').innerHTML = (s.next_steps || []).map((t) => `<li>${esc(t)}</li>`).join('');
}

function renderCritique(s) {
  if (!s.critique?.length) {
    $('o-critique').innerHTML = '';
    return;
  }
  const avg = Math.round((s.critique.reduce((a, c) => a + (c.score || 0), 0) / s.critique.length) * 10) / 10;
  $('o-critique').innerHTML = `
    <h4>推敲の採点表(平均 ${avg} / 10)</h4>
    <div class="table-scroll"><table class="critique">
      <thead><tr><th>基準</th><th>点</th><th>問題点</th><th>直したこと</th></tr></thead>
      <tbody>${s.critique
        .map((c) => `<tr><td>${esc(c.criterion)}</td><td class="${c.score >= 8 ? 'high' : 'low'}">${esc(c.score)}</td><td>${esc(c.issue)}</td><td>${esc(c.fix)}</td></tr>`)
        .join('')}</tbody>
    </table></div>
    <div class="verdict">${esc(s.verdict)}</div>`;
}

function currentEdited() {
  return {
    ...state.song,
    project: $('o-project').value.trim(),
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
    ? `<div class="warn-box"><b>機械チェック(${warnings.length}件)</b><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`
    : '';
}

function saveEdits() {
  if (!state.song) return;
  state.song = currentEdited();
  store.set('song', state.song);
}

function projectsOf(history) {
  return [...new Set(history.map((h) => h.project).filter(Boolean))].sort();
}

function renderHistory() {
  const history = store.get('history', []);
  // プロジェクトの候補(入力補完と絞り込み)
  const projects = projectsOf(history);
  $('project-list').innerHTML = projects.map((p) => `<option value="${esc(p)}"></option>`).join('');
  const sel = $('h-project');
  const current = sel.value;
  sel.innerHTML = '<option value="">すべて</option>' + projects.map((p) => `<option ${p === current ? 'selected' : ''}>${esc(p)}</option>`).join('');

  const q = $('h-search').value.trim().toLowerCase();
  const filtered = history.filter(
    (h) =>
      (!sel.value || h.project === sel.value) &&
      (!q || [h.title, h.lyrics, h.ratingNote, h.project].some((t) => String(t || '').toLowerCase().includes(q))),
  );
  if (!history.length) {
    $('history-view').innerHTML = '<div class="empty">まだ曲がありません。</div>';
    return;
  }
  if (!filtered.length) {
    $('history-view').innerHTML = '<div class="empty">条件に合う曲がありません。</div>';
    return;
  }
  // 同じ曲(songId)の版をまとめる
  const groups = [];
  const byId = {};
  for (const h of filtered) {
    const id = h.songId || h.createdAt;
    if (!byId[id]) {
      byId[id] = { id, items: [] };
      groups.push(byId[id]);
    }
    byId[id].items.push(h);
  }
  $('history-view').innerHTML = groups
    .map((g) => {
      const latest = g.items[0];
      const best = Math.max(0, ...g.items.map((h) => h.rating || 0));
      return `
      <details class="song-group" ${groups.length <= 3 ? 'open' : ''}>
        <summary><b>${esc(latest.title)}</b>
          ${latest.project ? `<span class="project-chip">${esc(latest.project)}</span>` : ''}
          <small>${g.items.length}版${best ? `・最高 ${'★'.repeat(best)}` : ''}</small></summary>
        ${g.items
          .map((h, i) => {
            const older = g.items[i + 1];
            return `
          <div class="history-item">
            <div><span class="version">v${h.version || 1}</span>${h.rating ? ` <span class="stars-s">${'★'.repeat(h.rating)}</span>` : ''}
              <small>${esc(new Date(h.createdAt).toLocaleString('ja-JP'))}・${esc(h.source)}${h.ratingNote ? `・${esc(h.ratingNote)}` : ''}</small></div>
            <div class="h-actions">
              <button class="sub" data-open="${esc(h.createdAt)}">開く</button>
              ${older ? `<button class="sub" data-diff="${esc(h.createdAt)}" data-diff-base="${esc(older.createdAt)}">前の版と比べる</button>` : ''}
              <button class="sub" data-del="${esc(h.createdAt)}">削除</button>
            </div>
          </div>`;
          })
          .join('')}
      </details>`;
    })
    .join('');
}

// 行単位の差分(最長共通部分列)
function lineDiff(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      out.push(['same', x[i]]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(['del', x[i++]]);
    else out.push(['add', y[j++]]);
  }
  while (i < x.length) out.push(['del', x[i++]]);
  while (j < y.length) out.push(['add', y[j++]]);
  return out;
}

function showDiff(newKey, oldKey) {
  const history = store.get('history', []);
  const n = history.find((h) => h.createdAt === newKey);
  const o = history.find((h) => h.createdAt === oldKey);
  if (!n || !o) return;
  const row = (label, a, b) =>
    a === b ? '' : `<p class="hint"><b>${label}</b>:<span class="del-inline">${esc(a || '(なし)')}</span> → ${esc(b || '(なし)')}</p>`;
  const diff = lineDiff(o.lyrics || '', n.lyrics || '')
    .map(([k, t]) => `<span class="${k}">${k === 'add' ? '+ ' : k === 'del' ? '− ' : '  '}${esc(t) || ' '}</span>`)
    .join('');
  $('diff-view').innerHTML = `
    <h3>「${esc(n.title)}」v${o.version || 1} → v${n.version || 1} の違い</h3>
    ${row('タイトル', o.title, n.title)}${row('Style', o.style, n.style)}${row('Exclude', o.exclude_styles, n.exclude_styles)}
    <div class="diff">${diff}</div>
    <p class="hint">緑が追加、赤が削除された行です。</p>`;
  $('diff-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- バックアップ ----------
const BACKUP_KEYS = ['song', 'history', 'analysis', 'refs', 'profile', 'lyrics', 'lyricStyle', 'useLyricStyle', 'preference', 'usePreference', 'drafts'];

function exportBackup() {
  const data = {};
  for (const k of BACKUP_KEYS) {
    const v = store.get(k, undefined);
    if (v !== undefined) data[k] = v;
  }
  // APIキー以外の設定(モデル名など)だけを含める
  const { claudeKey, geminiKey, ...safeSettings } = store.get('settings', {});
  data.settings = safeSettings;
  const payload = { app: 'music-creator', format: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `music-creator-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('backup-status', `書き出しました(曲の履歴 ${(data.history || []).length}件)。APIキーは含まれていません。`, 'ok');
}

async function importBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (payload?.app !== 'music-creator' || typeof payload.data !== 'object') throw new Error('Music Creator のバックアップファイルではありません。');
    const { settings: incoming, ...rest } = payload.data;
    for (const k of BACKUP_KEYS) if (k in rest) store.set(k, rest[k]);
    if (incoming) {
      const cur = store.get('settings', {});
      store.set('settings', { ...cur, ...incoming, claudeKey: cur.claudeKey, geminiKey: cur.geminiKey });
    }
    setStatus('backup-status', `読み込みました(曲の履歴 ${(rest.history || []).length}件)。画面を読み込み直します…`, 'ok');
    setTimeout(() => location.reload(), 900);
  } catch (err) {
    setStatus('backup-status', `読み込めませんでした:${err.message}`, 'error');
  }
}

// ---------- STEP 6 公開の準備 ----------
function releaseInput() {
  return { artist: $('rel-artist').value.trim(), target: $('rel-target').value.trim(), note: $('rel-note').value.trim() };
}

async function runRelease() {
  if (!state.song) {
    setStatus('rel-status', 'まだ曲がありません。STEP 2 か 3 で作るか、「作品と履歴」から開いてください。', 'error');
    return;
  }
  saveEdits();
  await withBusy('rel-status', 'Claude がリリース素材を作っています', async (onProgress) => {
    showRelease(await claude(P.systemForRelease(), P.userForRelease(state.song, releaseInput()), RELEASE_SCHEMA, onProgress));
  });
}

function showRelease(r) {
  state.release = r;
  const block = (title, text, key) =>
    `<div class="rel-block"><h4>${title}<button type="button" data-rel-copy="${key}">コピー</button></h4><p>${esc(text)}</p></div>`;
  state.releaseCopies = {
    catch: r.catchcopy,
    short: r.description_short,
    long: r.description_long,
    jacket: r.jacket_prompt,
    thumb: r.thumbnail_text,
  };
  (r.posts || []).forEach((p, i) => (state.releaseCopies[`post${i}`] = `${p.text}\n\n${(p.hashtags || []).join(' ')}`));
  $('rel-result').innerHTML = `
    <h3>リリース素材</h3>
    ${block('キャッチコピー', r.catchcopy, 'catch')}
    ${block('配信用の紹介文(短)', r.description_short, 'short')}
    ${block('概要欄用の紹介文(長)', r.description_long, 'long')}
    ${(r.posts || [])
      .map(
        (p, i) => `<div class="rel-block"><h4>${esc(p.platform)}<button type="button" data-rel-copy="post${i}">コピー</button></h4>
          <p>${esc(p.text)}</p><p class="tags">${esc((p.hashtags || []).join(' '))}</p></div>`,
      )
      .join('')}
    <div class="rel-block"><h4>ショート動画に切り抜く箇所</h4><p>${esc(r.highlight)}</p></div>
    ${block('ジャケット画像のプロンプト(英語)', r.jacket_prompt, 'jacket')}
    <p class="hint">日本語訳:${esc(r.jacket_prompt_ja)}</p>
    ${block('サムネイルの文字', r.thumbnail_text, 'thumb')}
    <div class="rel-block"><h4>公開前チェック</h4><ul>${(r.checklist || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>`;
}

function renderReleaseHeader() {
  const s = state.song;
  $('rel-current').innerHTML = s
    ? `対象の曲:<b>${esc(s.title)}</b>(v${s.version || 1}${s.rating ? `・${'★'.repeat(s.rating)}` : ''})`
    : 'まだ曲がありません。STEP 2 か 3 で作るか、「作品と履歴」から開いてください。';
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

// ---------- 入力の下書き保存 ----------
const DRAFT_IDS = ['c-message', 'c-audience', 'c-narrator', 'c-when', 'c-genre', 'c-mood', 'c-vocal', 'c-language', 'c-length', 'c-count', 'c-extra', 'e-lyrics', 'e-message', 'e-genre', 'e-strength', 'e-extra', 'a-title', 'a-notes', 'a-youtube', 'f-comment', 'l-label', 'l-lyrics', 'rel-artist', 'rel-target', 'rel-note'];

function restoreDrafts() {
  const drafts = store.get('drafts', {});
  for (const id of DRAFT_IDS) if (drafts[id] != null && $(id)) $(id).value = drafts[id];
  for (const id of DRAFT_IDS) {
    $(id)?.addEventListener('input', () => {
      const d = store.get('drafts', {});
      d[id] = $(id).value;
      store.set('drafts', d);
    });
  }
}

// ---------- 設定 ----------
function loadSettingsForm() {
  const s = settings();
  $('s-claude-key').value = s.claudeKey || '';
  $('s-claude-model').value = s.claudeModel;
  $('s-claude-effort').value = s.claudeEffort;
  $('s-gemini-key').value = s.geminiKey || '';
  $('s-gemini-model').value = s.geminiModel;
  $('s-auto-review').checked = s.autoReview;
}

function saveSettingsForm() {
  store.set('settings', {
    claudeKey: $('s-claude-key').value.trim(),
    claudeModel: $('s-claude-model').value.trim() || DEFAULTS.claudeModel,
    claudeEffort: $('s-claude-effort').value,
    geminiKey: $('s-gemini-key').value.trim(),
    geminiModel: $('s-gemini-model').value.trim() || DEFAULTS.geminiModel,
    autoReview: $('s-auto-review').checked,
  });
  updateChrome();
  toast('設定を保存しました');
}

// ---------- イベント ----------
function bind() {
  document.querySelectorAll('[role=tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  const runners = {
    auto: runAuto,
    hooks: runHooks,
    compose: () => runCompose(),
    enhance: runEnhance,
    analyze: runAnalyze,
    review: runReview,
    profile: runProfile,
    learn: runLearn,
    feedback: runFeedback,
    variants: runVariants,
    release: runRelease,
    preference: runPreference,
  };
  document.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => runners[b.dataset.run]?.()));

  document.querySelectorAll('[data-copy-prompt]').forEach((b) =>
    b.addEventListener('click', () => {
      const text = pastePromptFor(b.dataset.copyPrompt);
      if (text) {
        copyText(text);
        const details = b.closest('details');
        if (details) details.open = true;
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
      setSong(data, 'Gemini(コピペ)', { revision: isSameSong($('e-lyrics').value) });
    });
  $('a-paste-load').onclick = () => loadPasted('a-paste', 'a-status', (data) => setAnalysis(data, null, $('a-title').value.trim()));
  $('p-paste-load').onclick = () => loadPasted('p-paste', 'p-status', setProfile);
  $('l-paste-load').onclick = () => loadPasted('l-paste', 'l-status', (data) => setLyricStyle(data, aggregateStats(selectedLyrics())));
  $('r-paste-load').onclick = () => loadPasted('r-paste', 'r-status', (data) => setSong(data, 'Claude 推敲(コピペ)', { revision: true }));
  $('f-paste-load').onclick = () => loadPasted('f-paste', 'f-status', showFeedback);
  $('a-local').onclick = runLocalOnly;
  $('v-paste-load').onclick = () => loadPasted('v-paste', 'v-status', showVariants);
  $('pref-paste-load').onclick = () => loadPasted('pref-paste', 'pref-status', setPreferenceResult);
  $('pref-clear').onclick = () => {
    state.usePreference = false;
    store.set('usePreference', false);
    applyPreference();
    renderPreference();
    toast('学習した好みを使わない設定にしました');
  };

  // 評価
  $('o-rating').addEventListener('click', (e) => {
    const b = e.target.closest('[data-star]');
    if (b) setRating(Number(b.dataset.star));
  });
  $('o-rating-note').addEventListener('input', () => {
    if (!state.song) return;
    state.song.ratingNote = $('o-rating-note').value;
    store.set('song', state.song);
    syncHistoryEntry(state.song);
  });

  // Style の3案
  $('variants-result').addEventListener('click', (e) => {
    const copy = e.target.closest('[data-variant-copy]');
    const adopt = e.target.closest('[data-variant-adopt]');
    if (copy) copyText(state.variants[Number(copy.dataset.variantCopy)].style);
    if (adopt) {
      const v = state.variants[Number(adopt.dataset.variantAdopt)];
      saveEdits();
      setSong({ ...state.song, style: v.style, exclude_styles: v.exclude_styles, adoptedVariant: v.name }, `Style 比較:${v.name}`, { revision: true });
    }
  });

  // 歌詞の分析ビュー
  $('o-lyric-wrap').addEventListener('toggle', renderLyricView);
  $('o-lyric-view').addEventListener('click', (e) => {
    const line = e.target.closest('[data-line]');
    const opt = e.target.closest('[data-opt]');
    if (e.target.closest('#lv-go')) {
      runLineRewrite();
    } else if (opt) {
      replaceLine(state.selectedLine, opt.dataset.opt);
    } else if (line) {
      const idx = Number(line.dataset.line);
      state.selectedLine = state.selectedLine === idx ? null : idx;
      renderLyricView();
      $('lv-wish')?.focus();
    }
  });

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

  // 参考曲ライブラリ
  $('ref-library').addEventListener('click', (e) => {
    const sel = e.target.closest('[data-ref-select]');
    const show = e.target.closest('[data-ref-show]');
    const del = e.target.closest('[data-ref-del]');
    if (sel) {
      const r = state.refs.find((x) => x.id === sel.dataset.refSelect);
      if (r) r.selected = sel.checked;
    } else if (show) {
      state.lastAnalysis = state.refs.find((x) => x.id === show.dataset.refShow);
      renderAnalysis();
      $('analysis-result').scrollIntoView({ behavior: 'smooth' });
      return;
    } else if (del) {
      state.refs = state.refs.filter((x) => x.id !== del.dataset.refDel);
      renderLibrary();
    } else {
      return;
    }
    store.set('refs', state.refs);
  });

  // 歌詞の学習
  $('l-add').onclick = () => {
    const lyrics = $('l-lyrics').value.trim();
    if (!lyrics) {
      setStatus('l-status', '取り込む歌詞を貼り付けてください。', 'error');
      return;
    }
    const label = $('l-label').value.trim() || `歌詞${state.lyricItems.length + 1}`;
    state.lyricItems = [{ id: uid(), label, lyrics, selected: true }, ...state.lyricItems].slice(0, MAX_LYRICS);
    store.set('lyrics', state.lyricItems);
    $('l-lyrics').value = '';
    $('l-label').value = '';
    const d = store.get('drafts', {});
    delete d['l-lyrics'];
    delete d['l-label'];
    store.set('drafts', d);
    setStatus('l-status', '');
    renderLyricLibrary();
    toast('歌詞を取り込みました');
  };
  $('lyric-library').addEventListener('click', (e) => {
    const sel = e.target.closest('[data-lyric-select]');
    const del = e.target.closest('[data-lyric-del]');
    if (sel) {
      const l = state.lyricItems.find((x) => x.id === sel.dataset.lyricSelect);
      if (l) l.selected = sel.checked;
    } else if (del) {
      state.lyricItems = state.lyricItems.filter((x) => x.id !== del.dataset.lyricDel);
      renderLyricLibrary();
    } else {
      return;
    }
    store.set('lyrics', state.lyricItems);
  });
  $('l-clear-style').onclick = () => {
    state.useLyricStyle = false;
    store.set('useLyricStyle', false);
    applyLearnedStyle();
    renderLyricStyle();
    toast('学習結果を作詞に使わない設定にしました');
  };

  // ④
  ['o-title', 'o-style', 'o-exclude', 'o-lyrics'].forEach((id) =>
    $(id).addEventListener('input', () => {
      updateCounts();
      saveEdits();
      if (id === 'o-lyrics') {
        clearTimeout(renderLyricView.timer);
        renderLyricView.timer = setTimeout(renderLyricView, 400);
      }
    }),
  );
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText($(b.dataset.copy).value)));
  $('o-copy-all').onclick = () => copyText(toCopyBlock(currentEdited()));
  $('o-to-enhance').onclick = () => {
    saveEdits();
    $('e-lyrics').value = $('o-lyrics').value;
    $('e-message').value = state.song?.core_message || '';
    switchTab('enhance');
  };
  $('o-to-feedback').onclick = () => {
    saveEdits();
    switchTab('feedback');
  };
  $('o-download').onclick = () => {
    const song = currentEdited();
    const blob = new Blob([toCopyBlock(song)], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${song.title || 'song'}_v${song.version || 1}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $('history-view').addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    const diff = e.target.closest('[data-diff]');
    const del = e.target.closest('[data-del]');
    const history = store.get('history', []);
    if (open) {
      state.song = history.find((h) => h.createdAt === open.dataset.open);
      store.set('song', state.song);
      renderSong();
      updateChrome();
      switchTab('output');
    } else if (diff) {
      showDiff(diff.dataset.diff, diff.dataset.diffBase);
    } else if (del) {
      if (del.dataset.confirm !== 'yes') {
        del.dataset.confirm = 'yes';
        del.textContent = 'もう一度押すと削除';
        return;
      }
      store.set('history', history.filter((h) => h.createdAt !== del.dataset.del));
      $('diff-view').innerHTML = '';
      renderHistory();
      updateChrome();
      toast('削除しました');
    }
  });
  $('h-search').addEventListener('input', renderHistory);
  $('h-project').addEventListener('change', renderHistory);
  $('backup-export').onclick = exportBackup;
  $('backup-import').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importBackup(f);
    e.target.value = '';
  });
  $('rel-paste-load').onclick = () => loadPasted('rel-paste', 'rel-status', showRelease);
  $('rel-result').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rel-copy]');
    if (b) copyText(state.releaseCopies[b.dataset.relCopy] || '');
  });
  $('o-project').addEventListener('change', () => {
    saveEdits();
    syncHistoryEntry(state.song);
    renderHistory();
  });

  $('s-save').onclick = saveSettingsForm;
  $('s-clear').onclick = () => {
    const s = store.get('settings', {});
    delete s.claudeKey;
    delete s.geminiKey;
    store.set('settings', s);
    loadSettingsForm();
    updateChrome();
    toast('APIキーを削除しました');
  };

  // ページ先頭へ戻るボタン
  const toTop = $('to-top');
  window.addEventListener('scroll', () => (toTop.hidden = window.scrollY < 600), { passive: true });
  toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- 画面の付帯情報(キーの状態・手順タブのバッジ・注意書き) ----------
function updateChrome() {
  const s = settings();
  const badge = (on) => `<b class="${on ? 'on' : 'off'}">${on ? '設定済み' : 'なし'}</b>`;
  $('key-state').innerHTML = `APIキー:Claude ${badge(!!s.claudeKey)} Gemini ${badge(!!s.geminiKey)}`;
  const refs = state.refs.length;
  const learned = state.lyricStyle && state.useLyricStyle;
  const pref = state.preference && state.usePreference;
  $('nb-analyze').textContent = [refs ? `参考${refs}曲` : '', learned ? '書き方' : '', pref ? '好み' : ''].filter(Boolean).join('・') + (learned || pref ? 'を学習済み' : '') || 'Gemini・任意';
  $('nb-output').textContent = state.song ? `${state.song.title.slice(0, 10)} v${state.song.version || 1}` : '';
  const n = store.get('history', []).length;
  $('nb-history').textContent = n ? `${n}件` : '';
}

function renderRightsBanner() {
  const el = $('rights-banner');
  if (store.get('rightsDismissed', false)) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML =
    `<p><b>商用利用の注意:</b>${esc(SUNO_RIGHTS_NOTE.text)} ` +
    `<a href="${SUNO_RIGHTS_NOTE.url}" target="_blank" rel="noopener">Suno 公式ヘルプ</a></p>` +
    '<button type="button" id="rights-close">理解した</button>';
  $('rights-close').onclick = () => {
    store.set('rightsDismissed', true);
    renderRightsBanner();
  };
}

function init() {
  renderRightsBanner();
  $('f-symptoms').innerHTML = SYMPTOMS.map(
    (s, i) => `<label><input type="checkbox" id="f-sym-${i}" value="${esc(s)}" /> ${esc(s)}</label>`,
  ).join('');
  applyLearnedStyle();
  applyPreference();
  bind();
  restoreDrafts();
  loadSettingsForm();
  renderKnowledge();
  renderSong();
  renderHistory();
  renderAnalysis();
  renderLibrary();
  renderProfile();
  renderLyricLibrary();
  renderLyricStyle();
  renderPreference();
  updateChrome();
  switchTab(store.get('tab', 'compose'), { scroll: false });
}

init();
