// Cloudflare Pages Function: runs at /api/ai and keeps your free Gemini API key secret.
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'content-type': 'application/json' } });

async function ask(model, key, parts, noThinking) {
  const generationConfig = { responseMimeType: 'application/json', maxOutputTokens: 7000 };
  if (noThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts }], generationConfig })
  });
  return { r, j: await r.json().catch(() => ({})) };
}

export async function onRequest({ request, env }) {
  const key = env.GEMINI_API_KEY;
  const MODELS = [env.GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'].filter(Boolean);

  // Open /api/ai in a browser to run this check.
  if (request.method === 'GET') return json(200, { ok: true, keyIsSet: !!key, keyLength: key ? key.length : 0, models: MODELS });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!key) return json(500, { error: 'GEMINI_API_KEY is not set. Add it in Cloudflare, then redeploy.' });

  try {
    const { prompt, images } = await request.json();
    if (!prompt || !Array.isArray(images) || images.length > 4)
      return json(400, { error: 'Bad request (no photo received).' });

    const parts = [
      ...images.map(data => ({ inline_data: { mime_type: 'image/jpeg', data } })),
      { text: prompt }
    ];

    let lastErr = 'Unknown AI error';
    for (const model of MODELS) {
      for (const noThinking of [true, false]) {
        const { r, j } = await ask(model, key, parts, noThinking);
        if (r.ok) {
          const cand = j.candidates && j.candidates[0];
          const text = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
          const s = text.indexOf('{'), e = text.lastIndexOf('}');
          if (s < 0) { lastErr = 'AI gave no answer' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : ''); continue; }
          try { return json(200, JSON.parse(text.slice(s, e + 1))); }
          catch (_) { lastErr = 'AI answer could not be read'; continue; }
        }
        lastErr = (j.error && j.error.message) || ('AI status ' + r.status);
        if (r.status === 429) return json(429, { error: 'Free limit reached. Wait a minute. (' + lastErr + ')' });
        if (r.status === 401 || r.status === 403 || /API key/i.test(lastErr)) return json(r.status, { error: 'Key problem: ' + lastErr });
        if (r.status !== 400) break;
      }
    }
    return json(502, { error: lastErr });
  } catch (err) {
    return json(500, { error: 'Server error: ' + err.message });
  }
}
