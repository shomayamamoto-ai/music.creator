// ブラウザ内だけで行う簡易解析(テンポとキーの推定)。
// 音声ファイルは外部に送らずに計算します。あくまで「推定」で、
// 倍テン・半テンやキーの取り違え(平行調など)は起こり得ます。

export async function decodeAudio(file) {
  const buf = await file.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(buf.slice(0));
  } finally {
    ctx.close?.();
  }
}

function toMono(audioBuffer, maxSeconds = 90) {
  const sr = audioBuffer.sampleRate;
  const total = audioBuffer.length;
  // 曲の中盤(サビが来やすい位置)を中心に最大90秒を使う
  const len = Math.min(total, Math.floor(maxSeconds * sr));
  const start = Math.max(0, Math.floor((total - len) / 2));
  const out = new Float32Array(len);
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[start + i] / audioBuffer.numberOfChannels;
  }
  return { samples: out, sr };
}

// ---- テンポ推定:エネルギーの立ち上がり(オンセット)の自己相関 ----
export function estimateBpm(audioBuffer) {
  const { samples, sr } = toMono(audioBuffer);
  const hop = 512;
  const frames = Math.floor(samples.length / hop);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const o = f * hop;
    for (let i = 0; i < hop; i++) e += samples[o + i] * samples[o + i];
    env[f] = Math.log1p(1000 * e);
  }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, env[f] - env[f - 1]);
  // 平均を引いて正規化
  const mean = onset.reduce((a, b) => a + b, 0) / frames;
  for (let f = 0; f < frames; f++) onset[f] -= mean;

  const fps = sr / hop;
  const minBpm = 60;
  const maxBpm = 200;
  const minLag = Math.floor((60 * fps) / maxBpm);
  const maxLag = Math.ceil((60 * fps) / minBpm);
  const scores = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let f = 0; f + lag < frames; f++) s += onset[f] * onset[f + lag];
    scores.push({ lag, s: s / (frames - lag) });
  }
  // 人が「ノリ」として感じやすい 80〜160 BPM を少し優先する重み
  const weighted = scores.map(({ lag, s }) => {
    const bpm = (60 * fps) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    return { bpm, s: s * w, raw: s };
  });
  weighted.sort((a, b) => b.s - a.s);
  const best = weighted[0];
  if (!best || best.raw <= 0) return null;
  const bpm = best.bpm;
  const alt = bpm < 100 ? bpm * 2 : bpm / 2;
  return { bpm: Math.round(bpm), alternative: Math.round(alt) };
}

// ---- キー推定:クロマ(12音の強さ)と Krumhansl-Kessler の調性プロファイルの相関 ----
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

function correlate(a, b) {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

export function estimateKey(audioBuffer) {
  const { samples, sr } = toMono(audioBuffer);
  const N = 8192;
  const chroma = new Float64Array(12);
  const step = Math.floor(sr * 0.25);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  for (let o = 0; o + N < samples.length; o += step) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = samples[o + i] * win[i];
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const freq = (k * sr) / N;
      if (freq < 60 || freq > 2000) continue;
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += Math.log1p(mag);
    }
  }
  const results = [];
  for (let t = 0; t < 12; t++) {
    const rotated = Array.from({ length: 12 }, (_, i) => chroma[(i + t) % 12]);
    results.push({ key: `${NAMES[t]} major`, r: correlate(rotated, MAJOR) });
    results.push({ key: `${NAMES[t]} minor`, r: correlate(rotated, MINOR) });
  }
  results.sort((a, b) => b.r - a.r);
  return { key: results[0].key, runnerUp: results[1].key, confidence: results[0].r };
}

export async function analyzeLocally(file) {
  const audio = await decodeAudio(file);
  return {
    durationSec: Math.round(audio.duration),
    tempo: estimateBpm(audio),
    key: estimateKey(audio),
  };
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
