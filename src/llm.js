// Claude / Gemini 呼び出しをまとめたモジュール。
// どちらもブラウザから直接 API を呼びます(キーはこの端末の localStorage にだけ保存)。
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

export class LlmError extends Error {}

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

// ---------- Claude ----------
export async function callClaude({ apiKey, model, effort, system, user, schema, onProgress }) {
  if (!apiKey) throw new LlmError('Claude の APIキーが未設定です。「設定」タブで入力してください。');
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
    message = await runClaudeStream(client, withFallback, onProgress);
  } catch (err) {
    // フォールバック非対応のモデルを選んだ場合は、フォールバックなしで再実行
    if (err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message)) {
      message = await runClaudeStream(client, base, onProgress);
    } else {
      throw toFriendlyClaudeError(err);
    }
  }

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

async function runClaudeStream(client, params, onProgress) {
  const stream = client.beta.messages.stream(params);
  let chars = 0;
  stream.on('text', (delta) => {
    chars += delta.length;
    onProgress?.(chars);
  });
  return stream.finalMessage();
}

function toFriendlyClaudeError(err) {
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
    return new LlmError('Claude に接続できませんでした。ネット接続を確認してください。');
  }
  if (err instanceof Anthropic.APIError) {
    return new LlmError(`Claude APIエラー(${err.status ?? '不明'}):${err.message}`);
  }
  return err;
}

// ---------- Gemini ----------
// parts: [{ text }] / [{ inlineData: { mimeType, data } }] / [{ fileData: { fileUri } }] など
export async function callGemini({ apiKey, model, system, parts, schema, onProgress }) {
  if (!apiKey) throw new LlmError('Gemini の APIキーが未設定です。「設定」タブで入力してください。');
  // プレビュー版モデルや JSON スキーマ指定は v1beta で提供されるため明示する
  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
  let text = '';
  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        maxOutputTokens: 32000,
      },
    });
    for await (const chunk of stream) {
      const t = chunk.text;
      if (t) {
        text += t;
        onProgress?.(text.length);
      }
    }
  } catch (err) {
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
    throw new LlmError(`Gemini APIエラー:${msg}`);
  }
  return extractJson(text);
}
