import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MEMORY_DIR = 'ltzzz-memory';

export const MEMORY_FILES = [
  '魄.md',
  '识神.md',
  '梦境数据库.md',
  '文明研究.md',
  '项目历史.md',
  '重要事件.md'
];

export const MEMORY_SCHEMA = 'ltzzz.memory-context.v1';

export const MEMORY_RULES = [
  'owner 原话与 AI 解释分层：owner 主张逐字引用；AI 推论必须署名模型与日期，不得写成 owner 主张。',
  '观察 ≠ 证明：单次体感、梦境或事件不能推出普遍机制；不同 AI 同意不增加独立证据。',
  '历史快照 ≠ 今日状态：项目历史.md 与 重要事件.md 记录的是当时状态，引用前必须查最新回执。',
  '证据分四级：仓库机器回执 / 源码静态 / 独立测试 / 外部或链上二次核验；禁止统一写“已验证”。',
  '传统术语与现代科学映射是类比，不是等价；保留 GPT 与 DeepSeek 等模型的分歧。',
  '梦境只记录与后续验证，不当作预言；知道在做梦 ≠ 能控制梦境。',
  '讨论结论必须回写 Issue 评论；不能只在模型上下文里“达成共识”。',
  '记忆注入只是索引与约束，不等于全文已读；实际读取必须记录 path + sha256 + commit。'
];

export function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function extractTitle(text) {
  const line = text.split('\n').find(row => row.startsWith('# '));
  return line ? line.slice(2).trim() : '';
}

function extractAnnotation(text) {
  const lines = text.split('\n');
  const start = lines.findIndex(row => row.trim().startsWith('>'));
  if (start === -1) return '';
  const block = [];
  for (let i = start; i < lines.length; i += 1) {
    const row = lines[i].trim();
    if (!row.startsWith('>')) break;
    block.push(row.replace(/^>\s?/, ''));
  }
  return block.join('\n');
}

export function loadMemoryContext({
  root = '.',
  dir = MEMORY_DIR,
  files = MEMORY_FILES,
  commit = null,
  now = new Date()
} = {}) {
  const base = path.resolve(root, dir);
  const loaded = [];
  const missing = [];

  for (const name of files) {
    const filePath = path.join(base, name);
    const relative = path.posix.join(dir, name);
    try {
      const buffer = fs.readFileSync(filePath);
      const text = buffer.toString('utf8');
      loaded.push({
        name,
        path: relative,
        sha256: sha256Text(buffer),
        bytes: buffer.length,
        title: extractTitle(text),
        annotation: extractAnnotation(text),
        excerpt: text,
        missing: false
      });
    } catch (error) {
      missing.push(name);
      loaded.push({
        name,
        path: relative,
        sha256: null,
        bytes: 0,
        title: '',
        annotation: '',
        excerpt: '',
        missing: true,
        error: error.code || 'read_failed'
      });
    }
  }

  const digestInput = loaded.map(file => `${file.name}:${file.sha256 || 'MISSING'}`).join('\n');
  const loadedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  return {
    schema: MEMORY_SCHEMA,
    root: base,
    dir,
    commit,
    loaded_at: loadedAt,
    files: loaded,
    missing,
    complete: missing.length === 0,
    digest: sha256Text(digestInput)
  };
}

export function assertMemoryComplete(context) {
  if (!context || !context.complete) {
    const missing = context?.missing?.join(',') || 'unknown';
    throw new Error(`missing_memory_files:${missing}`);
  }
  return true;
}

export function memoryDigest(context) {
  return context?.digest || null;
}

export function renderMemoryRules() {
  return MEMORY_RULES.map((rule, index) => `${index + 1}. ${rule}`).join('\n');
}

export function buildMemoryBriefing(context, {maxCharsPerFile = 1200, includeExcerpt = true} = {}) {
  const lines = [];
  lines.push('# 六篇记忆讨论上下文（自动注入）');
  lines.push('');
  lines.push(`- 目录：\`${context?.dir || MEMORY_DIR}\``);
  lines.push(`- commit：\`${context?.commit || '-'}\``);
  lines.push(`- digest：\`${context?.digest || '-'}\``);
  lines.push(`- 完整性：${context?.complete ? '6/6' : `缺失 ${context?.missing?.join(',') || 'unknown'}`}`);
  lines.push(`- 注入时间：${context?.loaded_at || '-'}`);
  lines.push('');
  lines.push('> 本节是自动注入的索引与摘录，**不是全文**。不得据此声称已完整阅读；实际读取必须另行记录 path + sha256 + commit。');
  lines.push('');
  lines.push('## 阅读纪律（强制）');
  lines.push('');
  lines.push(renderMemoryRules());
  lines.push('');

  for (const file of context?.files || []) {
    lines.push(`## ${file.name}`);
    lines.push('');
    if (file.missing) {
      lines.push(`- 缺失：\`${file.path}\`（${file.error || 'not_found'}）。不得引用或补造内容。`);
      lines.push('');
      continue;
    }
    lines.push(`- path：\`${file.path}\``);
    lines.push(`- sha256：\`${file.sha256}\``);
    lines.push(`- bytes：${file.bytes}`);
    if (file.annotation) {
      lines.push('');
      lines.push('> 校注：');
      for (const row of file.annotation.split('\n')) lines.push(`> ${row}`);
    }
    if (includeExcerpt) {
      lines.push('');
      lines.push('```text');
      const excerpt = file.excerpt.length > maxCharsPerFile
        ? `${file.excerpt.slice(0, maxCharsPerFile)}\n…（摘录已截断，非全文）`
        : file.excerpt;
      lines.push(excerpt);
      lines.push('```');
    }
    lines.push('');
  }

  lines.push('## 本轮读取回执（需实际填写）');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    schema: 'ltzzz.memory-read-receipt.v1',
    reader: '<实际执行席>',
    read_at: '<ISO 时间>',
    commit: context?.commit || null,
    digest: context?.digest || null,
    files: (context?.files || []).map(file => ({
      name: file.name,
      path: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
      complete_read: false
    }))
  }, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('只有逐文件读完并把 `complete_read` 改为 `true`、写明 reader 与 read_at，才算完成读取回执。');
  lines.push('');
  lines.push('## 自动读取回执（脚本）');
  lines.push('');
  lines.push('> 脚本已把下列文件全文读入并计算 sha256；这不代表任何席位已理解或已表态。席位的阅读仍需上面的手动回执。');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    schema: 'ltzzz.memory-read-receipt.v1',
    reader: 'agent-debate-cycle(automated)',
    read_at: context?.loaded_at || null,
    commit: context?.commit || null,
    digest: context?.digest || null,
    complete: Boolean(context?.complete),
    files: (context?.files || []).map(file => ({
      name: file.name,
      path: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
      complete_read: !file.missing
    }))
  }, null, 2));
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

export function buildMemoryReadReceipt(context, {reader, readAt = new Date(), completeRead = true} = {}) {
  if (!reader) throw new Error('reader_required');
  return {
    schema: 'ltzzz.memory-read-receipt.v1',
    reader,
    read_at: readAt instanceof Date ? readAt.toISOString() : new Date(readAt).toISOString(),
    commit: context?.commit || null,
    digest: context?.digest || null,
    complete: Boolean(context?.complete),
    files: (context?.files || []).map(file => ({
      name: file.name,
      path: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
      complete_read: Boolean(completeRead && !file.missing)
    }))
  };
}
