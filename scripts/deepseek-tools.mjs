#!/usr/bin/env node
// CLI for the DeepSeek Search / Fetch tools. Read-only and opt-in: it never
// changes the planner model and never runs inside the main routing loop.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {searchWeb, fetchPage, TOOL_ENDPOINTS} from './lib/deepseek-tools.mjs';

const USAGE = `Usage:
  node scripts/deepseek-tools.mjs search --query <text> [--count 5] [--need-content] [--ori-question <text>] [--json]
  node scripts/deepseek-tools.mjs fetch --url <http(s)://...> [--json]
  node scripts/deepseek-tools.mjs --help

Env:
  DEEPSEEK_API_KEY   required; never printed or written to output
`;

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === 'help') {
    console.log(USAGE);
    return command ? 0 : 2;
  }
  if (command !== 'search' && command !== 'fetch') {
    console.error('unknown command: ' + command);
    console.error(USAGE);
    return 2;
  }
  const {values} = parseArgs({
    args: rest,
    options: {
      query: {type: 'string'},
      count: {type: 'string'},
      'need-content': {type: 'boolean'},
      'ori-question': {type: 'string'},
      url: {type: 'string'},
      json: {type: 'boolean'},
      help: {type: 'boolean'},
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  let result;
  if (command === 'search') {
    if (!values.query) {
      console.error('missing --query');
      return 2;
    }
    result = await searchWeb({
      query: values.query,
      count: values.count === undefined ? 10 : Number(values.count),
      needContent: values['need-content'] === true,
      oriQuestion: values['ori-question'] ?? null,
    });
  } else {
    if (!values.url) {
      console.error('missing --url');
      return 2;
    }
    result = await fetchPage({url: values.url});
  }

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    if (command === 'search') {
      console.log(`search ok: ${result.count} result(s), charged=${result.charged}`);
      for (const row of result.results) {
        console.log(`- ${row.title}\n  ${row.url}\n  ${row.snippet}`);
      }
    } else {
      console.log(`fetch ok: ${result.title || '(untitled)'} (${result.content_chars} chars)`);
      console.log(result.content);
    }
  } else {
    console.error(`${result.status}: ${result.error}`);
    if (result.retryable) console.error('retryable=true (wait before retrying)');
  }
  return result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath && invokedPath === import.meta.url) {
  main().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(`${error.code || 'error'}: ${error.message}`);
    process.exitCode = 2;
  });
}
