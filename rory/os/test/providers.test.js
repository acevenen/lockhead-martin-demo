import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockProvider, AnthropicProvider, OpenAIProvider, OllamaProvider } from '../providers/index.js';

// A fake fetch that records the request and returns canned JSON — so provider
// request-shaping and response-normalization are tested with no network.
function fakeFetch(responseJson, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts, body: opts?.body ? JSON.parse(opts.body) : undefined });
    return { ok, status, json: async () => responseJson, text: async () => JSON.stringify(responseJson) };
  };
  fn.calls = calls;
  return fn;
}

test('mock provider needs no key and is deterministic', async () => {
  const p = new MockProvider();
  const a = await p.complete({ prompt: 'hello', modelProfile: 'x' });
  const b = await p.complete({ prompt: 'hello', modelProfile: 'x' });
  assert.equal(a.text, b.text);
  assert.equal(a.cost_usd, 0);
});

test('real adapters fail closed without credentials', async () => {
  await assert.rejects(() => new AnthropicProvider({ fetch: fakeFetch({}), apiKey: '' }).complete({ prompt: 'x', model: 'm' }), /not configured/);
  await assert.rejects(() => new OpenAIProvider({ fetch: fakeFetch({}), apiKey: '' }).complete({ prompt: 'x', model: 'm' }), /not configured/);
  await assert.rejects(() => new OllamaProvider({ fetch: fakeFetch({}), baseUrl: '' }).complete({ prompt: 'x', model: 'm' }), /not configured/);
});

test('anthropic shapes the Messages request and normalizes the reply', async () => {
  const f = fakeFetch({ model: 'claude-x', content: [{ type: 'text', text: 'hi there' }], usage: { input_tokens: 5, output_tokens: 2 } });
  const p = new AnthropicProvider({ fetch: f, apiKey: 'k-test' });
  const out = await p.complete({ system: 'be brief', prompt: 'hello', model: 'claude-x', maxTokens: 256 });
  const call = f.calls[0];
  assert.match(call.url, /\/v1\/messages$/);
  assert.equal(call.opts.headers['x-api-key'], 'k-test');
  assert.equal(call.opts.headers['anthropic-version'], '2023-06-01');
  assert.equal(call.body.system, 'be brief');
  assert.equal(call.body.messages[0].content, 'hello');
  assert.equal(out.text, 'hi there');
  assert.deepEqual(out.usage, { input_tokens: 5, output_tokens: 2 });
  assert.equal(out.provider, 'anthropic');
});

test('openai shapes the chat request and normalizes the reply', async () => {
  const f = fakeFetch({ model: 'gpt-x', choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } });
  const p = new OpenAIProvider({ fetch: f, apiKey: 'k' });
  const out = await p.complete({ system: 's', prompt: 'p', model: 'gpt-x' });
  const call = f.calls[0];
  assert.match(call.url, /\/v1\/chat\/completions$/);
  assert.equal(call.opts.headers.authorization, 'Bearer k');
  assert.equal(call.body.messages[0].role, 'system');
  assert.equal(call.body.messages[1].content, 'p');
  assert.equal(out.text, 'ok');
  assert.deepEqual(out.usage, { input_tokens: 7, output_tokens: 3 });
});

test('ollama posts to the local chat endpoint and needs no key', async () => {
  const f = fakeFetch({ model: 'llama', message: { content: 'local reply' }, prompt_eval_count: 4, eval_count: 6 });
  const p = new OllamaProvider({ fetch: f, baseUrl: 'http://127.0.0.1:11434' });
  const out = await p.complete({ prompt: 'p', model: 'llama' });
  assert.match(f.calls[0].url, /\/api\/chat$/);
  assert.equal(f.calls[0].body.stream, false);
  assert.equal(out.text, 'local reply');
  assert.deepEqual(out.usage, { input_tokens: 4, output_tokens: 6 });
});

test('non-ok HTTP surfaces a PROVIDER_HTTP error', async () => {
  const f = fakeFetch({ error: 'nope' }, { ok: false, status: 401 });
  const p = new OpenAIProvider({ fetch: f, apiKey: 'k' });
  await assert.rejects(() => p.complete({ prompt: 'p', model: 'm' }), /HTTP 401/);
});
