// Archive -> canonical mapping for the memory library index.
// Rule (owner-confirmed 2026-11-16): strip one known archive suffix and point
// at the canonical file with the same stem; anything else stays null.
// This never moves, deletes or rewrites the memory bodies themselves.

export const CANONICAL_FILES = [
  'README.md',
  '装备论.md',
  '魄.md',
  '识神.md',
  '梦境数据库.md',
  '文明研究.md',
  '项目历史.md',
  '重要事件.md',
];

// Ordered longest-first so '-DeepSeek提炼' is matched before '-入档'.
const ARCHIVE_SUFFIXES = ['-DeepSeek提炼', '-入档'];

export function archiveCanonicalTarget(file, canonicalSet = CANONICAL_FILES) {
  if (typeof file !== 'string' || !file.endsWith('.md') || file.includes('/')) return null;
  const base = file.slice(0, -3);
  let stem = null;
  for (const suffix of ARCHIVE_SUFFIXES) {
    if (base.endsWith(suffix) && base.length > suffix.length) {
      stem = base.slice(0, -suffix.length);
      break;
    }
  }
  if (!stem) {
    const versioned = /^(.+)-v\d+$/.exec(base);
    if (versioned) stem = versioned[1];
  }
  if (!stem) {
    const supplementary = /^(.+)-补录(?:-.+)?$/.exec(base);
    if (supplementary) stem = supplementary[1];
  }
  if (!stem) return null;
  const target = stem + '.md';
  return canonicalSet.includes(target) ? target : null;
}

export function applyArchiveMapping(items, canonicalSet = CANONICAL_FILES) {
  const mapped = [];
  for (const item of items) {
    if (item.class !== 'version_or_archive' || item.canonical_target != null) continue;
    const target = archiveCanonicalTarget(item.path, canonicalSet);
    if (!target) continue;
    item.canonical_target = target;
    item.canonical_rule = 'suffix_strip_to_canonical';
    mapped.push(item.path);
  }
  return mapped;
}
