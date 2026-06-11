exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  if (body.ping) return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  const { provider, messages, systemPrompt, maxTokens = 1200 } = body;
  if (!provider || !messages) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing provider or messages' }) };
  try {
    let text = '';
    if (provider === 'groq') {
      const key = process.env.GROQ_API_KEY;
      if (!key) return { statusCode: 503, headers, body: JSON.stringify({ error: 'GROQ_API_KEY not set' }) };
      text = await callOAI('https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile', key, messages, systemPrompt, maxTokens);
    } else if (provider === 'claude') {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return { statusCode: 503, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) };
      text = await callClaude(key, messages, systemPrompt, maxTokens);
    } else if (provider === 'gemini') {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return { statusCode: 503, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY not set' }) };
      text = await callGemini(key, messages, systemPrompt, maxTokens);
    } else if (provider === 'gpt') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return { statusCode: 503, headers, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
      text = await callOAI('https://api.openai.com/v1/chat/completions', 'gpt-4o-mini', key, messages, systemPrompt, maxTokens);
    } else if (provider === 'deepseek') {
      const key = process.env.DEEPSEEK_API_KEY;
      if (!key) return { statusCode: 503, headers, body: JSON.stringify({ error: 'DEEPSEEK_API_KEY not set' }) };
      text = await callOAI('https://api.deepseek.com/v1/chat/completions', 'deepseek-chat', key, messages, systemPrompt, maxTokens);
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown provider' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || 'Internal error' }) };
  }
};

async function callOAI(url, model, key, messages, systemPrompt, maxTokens) {
  const msgs = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages.filter(m => m.role !== 'system')] : messages.filter(m => m.role !== 'system');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ model, max_tokens: maxTokens, messages: msgs, stream: false }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Error ' + res.status);
  return data.choices?.[0]?.message?.content || '';
}

async function callClaude(key, messages, systemPrompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': key }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system: systemPrompt || 'You are a knowledgeable Islamic scholar.', messages: messages.filter(m => m.role !== 'system'), stream: false }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Claude error ' + res.status);
  return data.content?.[0]?.text || '';
}

async function callGemini(key, messages, systemPrompt, maxTokens) {
  const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gemini error ' + res.status);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
