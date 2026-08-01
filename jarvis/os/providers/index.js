// Provider adapters sit behind one interface so the control plane never depends
// on a specific vendor. In this phase only the mock provider runs; the real
// adapters are declared boundaries that refuse to run without explicit config,
// and they never use Claude Code's interactive credentials (directive §10).
//
// Interface: complete({ system, prompt, modelProfile, model, tools }) ->
//   { text, usage: { input_tokens, output_tokens }, cost_usd, provider, model }

/** Deterministic mock. No network, no keys. Used by tests and demo:e2e. */
export class MockProvider {
  constructor(scripted = {}) {
    // scripted maps a substring of the prompt -> a canned reply, for tests.
    this.scripted = scripted;
    this.name = 'mock';
  }

  async complete({ prompt = '', modelProfile = 'mock', model = 'mock-1' }) {
    let text = `[mock:${modelProfile}] acknowledged`;
    for (const [needle, reply] of Object.entries(this.scripted)) {
      if (prompt.includes(needle)) { text = reply; break; }
    }
    const input = Math.ceil(prompt.length / 4);
    const output = Math.ceil(text.length / 4);
    return {
      text,
      usage: { input_tokens: input, output_tokens: output },
      cost_usd: 0,
      provider: this.name,
      model,
    };
  }
}

/** A real adapter that fails closed until it is explicitly configured. */
class UnconfiguredProvider {
  constructor(name, envVar) { this.name = name; this.envVar = envVar; }
  async complete() {
    throw Object.assign(
      new Error(`${this.name} provider is not configured. Set ${this.envVar} and wire the official SDK before use (see docs/operations/connect-*.md).`),
      { code: 'PROVIDER_UNCONFIGURED' },
    );
  }
}

export class AnthropicProvider extends UnconfiguredProvider {
  constructor() { super('anthropic', 'ANTHROPIC_API_KEY'); }
}
export class OpenAIProvider extends UnconfiguredProvider {
  constructor() { super('openai', 'OPENAI_API_KEY'); }
}
export class OllamaProvider extends UnconfiguredProvider {
  constructor() { super('ollama', 'JARVIS_OLLAMA_URL'); }
}

/** Resolve a provider adapter by name. Defaults everything to mock unless the
 *  caller opts into real providers AND they are configured. */
export function makeProviderPool({ useMock = true } = {}) {
  if (useMock) {
    const mock = new MockProvider();
    return { get: () => mock, mock };
  }
  const pool = {
    anthropic: new AnthropicProvider(),
    openai: new OpenAIProvider(),
    ollama: new OllamaProvider(),
    mock: new MockProvider(),
  };
  return { get: (name) => pool[name] ?? pool.mock, ...pool };
}
