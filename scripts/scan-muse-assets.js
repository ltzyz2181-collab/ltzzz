/**
 * scan-muse-assets.js
 * 读取 assets/video/muse/ 目录下所有 *.meta.json，校验后输出 manifest。
 * 供 YouTube/TikTok 发布流程消费：只发布 status=reviewed 且 human_confirm=true 的条目。
 *
 * 用法：node scripts/scan-muse-assets.js [--out assets/video/muse/manifest.json]
 * 默认输出到 stdout；带 --out 时同时写文件。
 */
const fs = require('fs');
const path = require('path');

const MUSE_DIR = path.join(__dirname, '..', 'assets', 'video', 'muse');
const outIdx = process.argv.indexOf('--out');
const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : null;

function loadMeta(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { parse_error: e.message };
  }
}

function validate(meta, file) {
  const errors = [];
  if (!meta.id) errors.push('missing id');
  if (meta.source && meta.source !== 'muse') errors.push('source must be "muse"');
  if (!meta.created_at) errors.push('missing created_at');
  if (!meta.file) errors.push('missing file (外部URL或相对路径)');
  if (!meta.title) errors.push('missing title');
  if (!['drafted', 'reviewed', 'published', 'rejected'].includes(meta.status)) {
    errors.push(`bad status: ${meta.status}`);
  }
  if (meta.status === 'reviewed' && meta.human_confirm !== true) {
    errors.push('reviewed 但 human_confirm !== true');
  }
  if (meta.status === 'published' && (!meta.youtube_video_id && !meta.tiktok_publish_id)) {
    errors.push('published 但缺少 youtube_video_id / tiktok_publish_id');
  }
  return errors;
}

function main() {
  if (!fs.existsSync(MUSE_DIR)) {
    console.error(`MUSE_DIR 不存在: ${MUSE_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(MUSE_DIR).filter((f) => f.endsWith('.meta.json'));
  const entries = files
    .map((f) => {
      const meta = loadMeta(path.join(MUSE_DIR, f));
      const errors = validate(meta, f);
      return { file: f, meta, valid: errors.length === 0, errors };
    })
    .sort((a, b) => (a.file < b.file ? -1 : 1));

  const manifest = {
    generated_at: new Date().toISOString(),
    source: 'muse',
    count: entries.length,
    publishable: entries.filter(
      (e) => e.valid && e.meta.status === 'reviewed' && e.meta.human_confirm === true,
    ).length,
    entries,
  };

  const out = JSON.stringify(manifest, null, 2);
  if (outFile) {
    fs.writeFileSync(path.join(__dirname, '..', outFile), out, 'utf8');
    console.log(`manifest 已写入: ${outFile} (${entries.length} 条)`);
  } else {
    console.log(out);
  }
}

main();
