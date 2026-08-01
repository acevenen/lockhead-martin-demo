// Provider adapters sit behind one interface so the control plane never depends
// on a specific vendor. The mock runs everywhere with no keys; the real adapters
// make HTTP calls via an INJECTED fetch (so tests never hit the network) and
// FAIL CLOSED until their credential env var is set. They never use Claude
// Code's interactive credentials (directive §10).
//
// Interface: complete({ system, prompt, model, modelProfile, maxTokens }) ->
//   { text, usage: { input_tokens, output_tokens }, cost_usd, provider, model }

function errUnconfigured(name, envVar) {
  return Object.assign(
    new Error(`${name} provider is not configured. Set ${envVar} (see docs/operations/connect-*.md).`),
    { code: 'PROVIDER_UNCONFIGURED' },
  );
}

/** Deterministic mock. No network, no keys. Default for tests and demo:e2e. */
export class MockProvider {
  constructor(scripted = {}) { this.scripted = scripted; this.name = 'mock'; }
  async complete({ prompt = '', modelProfile = 'mock', model = 'mock-1' }) {
    let text = `[mock:${modelProfile}] acknowledged`;
    for (const [needle, reply] of Object.entries(this.scripted)) {
      if (prompt.includes(needle)) { text = reply; break; }
    }
    return {
      text,
      usage: { input_tokens: Math.ceil(prompt.length / 4), output_tokens: Math.ceil(text.length / 4) },
      cost_usd: 0, provider: this.name, model,
    };
  }
}

export class AnthropicProvider {
  constructor({ fetch = globalThis.fetch, apiKey = process.env.ANTHROPIC_API_KEY, baseUrl = 'https://api.anthropic.com', version = '2023-06-01' } = {}) {
    this.name = 'anthropic'; this._fetch = fetch; this.apiKey = apiKey; this.baseUrl = baseUrl; this.version = version;
  }
  async complete({ system, prompt, model, modelProfile, maxTokens = 1024 }) {
    if (!this.apiKey) throw errUnconfigured('anthropic', 'ANTHROPIC_API_KEY');
    const res = await this._fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': this.version },
      body: JSON.stringify({ model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await okJson(res, 'anthropic');
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 }, cost_usd: null, provider: this.name, model: data.model ?? model };
  }
}

export class OpenAIProvider {
  constructor({ fetch = globalThis.fetch, apiKey = process.env.OPENAI_API_KEY, baseUrl = 'https://api.openai.com' } = {}) {
    this.name = 'openai'; this._fetch = fetch; this.apiKey = apiKey; this.baseUrl = baseUrl;
  }
  async complete({ system, prompt, model, maxTokens }) {
    if (!this.apiKey) throw errUnconfigured('openai', 'OPENAI_API_KEY');
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const res = await this._fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model, messages, ...(maxTokens ? { max_tokens: maxTokens } : {}) }),
    });
    const data = await okJson(res, 'openai');
    return { text: data.choices?.[0]?.message?.content ?? '', usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 }, cost_usd: null, provider: this.name, model: data.model ?? model };
  }
}

export class OllamaProvider {
  // Local runtime — no API key; needs a reachable Ollama URL.
  constructor({ fetch = globalThis.fetch, baseUrl = process.env.JARVIS_OLLAMA_URL } = {}) {
    this.name = 'ollama'; this._fetch = fetch; this.baseUrl = baseUrl;
  }
  async complete({ system, prompt, model }) {
    if (!this.baseUrl) throw errUnconfigured('ollama', 'JARVIS_OLLAMA_URL');
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const res = await this._fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    const data = await okJson(res, 'ollama');
    return { text: data.message?.content ?? '', usage: { input_tokens: data.prompt_eval_count ?? 0, output_tokens: data.eval_count ?? 0 }, cost_usd: 0, provider: this.name, model: data.model ?? model };
  }
}

async function okJson(res, name) {
  if (!res || typeof res.json !== 'function') throw new Error(`${name}: invalid fetch response`);
  if (res.ok === false) {
    const body = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
    throw Object.assign(new Error(`${name} HTTP ${res.status}: ${String(body).slice(0, 200)}`), { code: 'PROVIDER_HTTP' });
  }
  return res.json();
}

/** Resolve a provider pool. Mock everywhere by default; opt into real ones. */
export function makeProviderPool({ useMock = true, fetch } = {}) {
  if (useMock) {
    const mock = new MockProvider();
    return { get: () => mock, mock };
  }
  const pool = {
    anthropic: new AnthropicProvider({ fetch }),
    openai: new OpenAIProvider({ fetch }),
    ollama: new OllamaProvider({ fetch }),
    mock: new MockProvider(),
  };
  return { get: (name) => pool[name] ?? pool.mock, ...pool };
}
