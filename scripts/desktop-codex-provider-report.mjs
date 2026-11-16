function stripComment(line) {
  let quote = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quote) {
      if (quote === '"' && escaped) {
        escaped = false;
      } else if (quote === '"' && character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '#') {
      return line.slice(0, index);
    }
  }

  return line;
}

function parseValue(rawValue) {
  const value = rawValue.trim();
  if (!value) return null;

  if (value.startsWith('"')) {
    let escaped = false;
    for (let index = 1; index < value.length; index += 1) {
      const character = value[index];
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        const literal = value.slice(0, index + 1);
        try {
          return JSON.parse(literal);
        } catch {
          return literal.slice(1, -1);
        }
      }
    }
    return null;
  }

  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1);
    return end === -1 ? null : value.slice(1, end);
  }

  return value.split(/\s+/, 1)[0] || null;
}

function parseAssignment(line) {
  const separator = line.indexOf('=');
  if (separator === -1) return null;

  const key = line.slice(0, separator).trim();
  if (!key) return null;

  return { key, value: parseValue(line.slice(separator + 1)) };
}

function parseTable(line) {
  const match = line.match(
    /^\[\s*model_providers\s*\.\s*(?:([A-Za-z0-9_-]+)|"((?:\\.|[^"\\])*)"|'([^']*)')\s*\]$/,
  );
  if (!match) return null;

  const provider = match[1] ?? match[2] ?? match[3];
  return provider || null;
}

export function parseCodexProviderConfig(text) {
  let model = null;
  let provider = null;
  let currentProvider = null;
  let inTable = false;
  const providers = new Map();

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;

    if (line.startsWith('[')) {
      inTable = true;
      currentProvider = parseTable(line);
      if (currentProvider && !providers.has(currentProvider)) {
        providers.set(currentProvider, {});
      }
      continue;
    }

    const assignment = parseAssignment(line);
    if (!assignment) continue;

    if (inTable) {
      if (
        currentProvider &&
        (assignment.key === 'base_url' || assignment.key === 'wire_api') &&
        assignment.value !== null
      ) {
        providers.get(currentProvider)[assignment.key] = assignment.value;
      }
      continue;
    }

    if (assignment.key === 'model') {
      model = assignment.value;
    } else if (assignment.key === 'model_provider') {
      provider = assignment.value;
    }
  }

  const selectedProvider = provider === null ? null : providers.get(provider);
  return {
    model,
    provider,
    base_url: selectedProvider?.base_url ?? null,
    wire_api: selectedProvider?.wire_api ?? null,
  };
}
