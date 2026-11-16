import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodexProviderConfig } from '../desktop-codex-provider-report.mjs';

test('parses the selected provider section', () => {
  const config = `
model = "deepseek-flash"
model_provider = "deepseek"

[model_providers.deepseek]
base_url = "https://api.deepseek.com/v1"
wire_api = "responses"
requires_openai_auth = false
`;

  assert.deepEqual(parseCodexProviderConfig(config), {
    model: 'deepseek-flash',
    provider: 'deepseek',
    base_url: 'https://api.deepseek.com/v1',
    wire_api: 'responses',
  });
});

test('returns null provider details when the provider section is missing', () => {
  const config = `
model = "gpt-5.6-sol"
model_provider = "missing"

[model_providers.other]
base_url = "https://other.example/v1"
wire_api = "chat"
`;

  assert.deepEqual(parseCodexProviderConfig(config), {
    model: 'gpt-5.6-sol',
    provider: 'missing',
    base_url: null,
    wire_api: null,
  });
});

test('ignores full-line and trailing comments without truncating quoted values', () => {
  const config = `
# model = "commented-out"
model = "custom-model" # active model
model_provider = "custom" # active provider

[model_providers.custom] # provider settings
# base_url = "https://ignored.example/v1"
base_url = "https://api.example/v1#workspace" # fragment is part of the URL
wire_api = 'responses' # quoted value
`;

  assert.deepEqual(parseCodexProviderConfig(config), {
    model: 'custom-model',
    provider: 'custom',
    base_url: 'https://api.example/v1#workspace',
    wire_api: 'responses',
  });
});
