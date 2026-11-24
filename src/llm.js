// Claude / Gemini 呼び出しをまとめたモジュール。
// どちらもブラウザから直接 API を呼びます(キーはこの端末の localStorage にだけ保存)。
// SDK は大きいので別ファイルにし、必要になったときにだけ読み込みます(起動を速くするため)。

export class LlmError extends Error {}
export class AbortedError extends LlmError {
  constructor() {
    super('中止しました。');
  }
}

// ---------- SDK の遅延読み込み ----------
const loading = {};
function loadScript(src) {
  if (!loading[src]) {
    loading[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        delete loading[src];
        reject(new LlmError('AI の部品を読み込めませんでした。ネット接続を確認して、もう一度お試しください。'));
      };
      document.head.appendChild(s);
    });
  }
  return loading[src];
}

async function getAnthropic() {
  if (!window.__MC_Anthropic) await loadScript('dist/claude.js');
  return window.__MC_Anthropic;
}

async function getGoogleGenAI() {
  if (!window.__MC_GoogleGenAI) await loadScript('dist/gemini.js');
  return window.__MC_GoogleGenAI;
}

// 画面が落ち着いたら、先に読み込んでおく(押した瞬間の待ち時間を減らす)
export function preloadSdks({ claude = true, gemini = true } = {}) {
  const run = () => {
    if (claude) getAnthropic().catch(() => {});
    if (gemini) getGoogleGenAI().catch(() => {});
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}

// ---------- 料金の目安(Anthropic 公式の 100万トークンあたりの米ドル。2026-11 時点) ----------
const CLAUDE_PRICES = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-fable-5-2': [8, 40],
};

export function estimateClaudeCost(model, usage) {
  const p = CLAUDE_PRICES[model];
  if (!p || !usage) return null;
  return ((usage.input_tokens || 0) * p[0] + (usage.output_tokens || 0) * p[1]) / 1e6;
}

// JSON を取り出す(コピペモードで返ってきた文章にも対応できるよう寛容に)。
export function extractJson(text) {
  if (!text) throw new LlmError('AIの返答が空でした。');
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // ```json ... ``` や前後の説明文を取り除いて再挑戦
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch (_) {}
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (_) {}
  }
  throw new LlmError(
    'AIの返答をJSONとして読み取れませんでした。\n' +
      '返答の全文(「{」から「}」まで)を貼り付けているか確認してください。',
  );
}

const isNetworkError = (err) => /network|fetch|Failed to fetch|ECONN|timeout|socket/i.test(String(err?.message || err));

// ---------- Claude ----------
// onUsage({ model, input, output, costUsd }) で使用量を受け取れます。signal で中止できます。
export async function callClaude({ apiKey, model, effort, system, user, schema, onProgress, onUsage, signal }) {
  if (!apiKey) throw new LlmError('Claude の APIキーが未設定です。「設定」タブで入力してください。');
  const Anthropic = await getAnthropic();
  if (signal?.aborted) throw new AbortedError();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const base = {
    model,
    max_tokens: 32000,
    system,
    messages: [{ role: 'user', content: user }],
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema } },
  };
  // 安全フィルターで止まったときに別モデルへ自動で引き継ぐ設定(サーバー側フォールバック)。
  const withFallback = { ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

  let message;
  try {
    message = await runClaudeStream(client, withFallback, onProgress, signal);
  } catch (err) {
    if (signal?.aborted) throw new AbortedError();
    // フォールバック非対応のモデルを選んだ場合は、フォールバックなしで再実行
    if (err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message)) {
      message = await runClaudeStream(client, base, onProgress, signal).catch((e) => {
        throw signal?.aborted ? new AbortedError() : toFriendlyClaudeError(Anthropic, e);
      });
    } else {
      throw toFriendlyClaudeError(Anthropic, err);
    }
  }

  onUsage?.({
    provider: 'Claude',
    model,
    input: message.usage?.input_tokens || 0,
    output: message.usage?.output_tokens || 0,
    costUsd: estimateClaudeCost(model, message.usage),
  });

  if (message.stop_reason === 'refusal') {
    throw new LlmError('Claude がこの依頼への回答を控えました。表現を変えて再度お試しください。');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new LlmError('出力が長すぎて途中で切れました。案の数を減らすか、条件を絞ってください。');
  }
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return extractJson(text);
}

async function runClaudeStream(client, params, onProgress, signal) {
  const stream = client.beta.messages.stream(params, { signal });
  let chars = 0;
  stream.on('text', (delta) => {
    chars += delta.length;
    onProgress?.(chars);
  });
  return stream.finalMessage();
}

function toFriendlyClaudeError(Anthropic, err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return new LlmError('Claude の APIキーが正しくないようです。「設定」タブで確認してください。');
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new LlmError('この APIキーでは選択中の Claude モデルを使えません。モデル名を確認してください。');
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new LlmError('Claude のモデル名が見つかりません。「設定」タブでモデル名を確認してください。');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmError('Claude の利用上限に達しました。少し時間をおいて再実行してください。');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new LlmError('Claude に接続できませんでした。ネット接続を確認して、「もう一度試す」を押してください。');
  }
  if (err instanceof Anthropic.APIError) {
    return new LlmError(`Claude APIエラー(${err.status ?? '不明'}):${err.message}`);
  }
  return err;
}

// ---------- Gemini ----------
// parts: [{ text }] / [{ inlineData: { mimeType, data } }] / [{ fileData: { fileUri } }] など
export async function callGemini({ apiKey, model, system, parts, schema, onProgress, onUsage, signal }) {
  if (!apiKey) throw new LlmError('Gemini の APIキーが未設定です。「設定」タブで入力してください。');
  const GoogleGenAI = await getGoogleGenAI();
  if (signal?.aborted) throw new AbortedError();
  // プレビュー版モデルや JSON スキーマ指定は v1beta で提供されるため明示する
  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });

  const attempt = async () => {
    let text = '';
    let usage = null;
    let finish = null;
    const stream = await ai.models.generateContentStream({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        maxOutputTokens: 32000,
        abortSignal: signal,
      },
    });
    try {
    for await (const chunk of stream) {
      if (signal?.aborted) throw new AbortedError();
      const t = chunk.text;
      if (t) {
        text += t;
        onProgress?.(text.length);
      }
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
      const fr = chunk.candidates?.[0]?.finishReason;
      if (fr) finish = fr;
      if (chunk.promptFeedback?.blockReason) finish = `BLOCKED:${chunk.promptFeedback.blockReason}`;
    }
    } catch (err) {
      // 途中まで受け取っていたら、自動のやり直しはしない
      if (text) err.partial = true;
      throw err;
    }
    return { text, usage, finish };
  };

  let result;
  try {
    try {
      result = await attempt();
    } catch (err) {
      // 通信が一瞬切れただけなら、1回だけ自動でやり直す(返答を受け取り始める前に切れた場合のみ。二重の料金を避ける)
      if (!signal?.aborted && isNetworkError(err) && !err.partial) result = await attempt();
      else throw err;
    }
  } catch (err) {
    if (signal?.aborted || err instanceof AbortedError) throw new AbortedError();
    const msg = String(err?.message || err);
    if (/API key not valid|API_KEY_INVALID|401|403/i.test(msg)) {
      throw new LlmError('Gemini の APIキーが正しくないか、権限がありません。「設定」タブで確認してください。');
    }
    if (/not found|404/i.test(msg)) {
      throw new LlmError('Gemini のモデル名が見つかりません。「設定」タブでモデル名を確認してください。');
    }
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
      throw new LlmError('Gemini の利用上限に達しました。少し時間をおいて再実行してください。');
    }
    if (isNetworkError(err)) {
      throw new LlmError('Gemini に接続できませんでした。ネット接続を確認して、「もう一度試す」を押してください。');
    }
    throw new LlmError(`Gemini APIエラー:${msg}`);
  }
  if (result.finish === 'MAX_TOKENS') {
    throw new LlmError('Gemini の出力が長すぎて途中で切れました。条件を絞るか、歌詞を短くしてもう一度お試しください。');
  }
  if (result.finish && /SAFETY|BLOCK|PROHIBITED|RECITATION/.test(result.finish)) {
    throw new LlmError('Gemini がこの依頼への回答を控えました(安全・著作権の判定)。表現を変えるか、参考曲の歌詞の引用を減らしてください。');
  }
  onUsage?.({
    provider: 'Gemini',
    model,
    input: result.usage?.promptTokenCount || 0,
    output: (result.usage?.candidatesTokenCount || 0) + (result.usage?.thoughtsTokenCount || 0),
    costUsd: null, // Gemini の料金はモデルやプランで変わるため、ここでは計算しない
  });
  return extractJson(result.text);
}
