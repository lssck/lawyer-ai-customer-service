/**
 * build-prompts.js
 * 将 skill.md 和 knowledge-base.md 的内容嵌入到 functions/prompts.js
 * 在部署前运行: node build-prompts.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname);
const skillMd = fs.readFileSync(path.join(root, 'skill.md'), 'utf-8');
const kbMd = fs.readFileSync(path.join(root, 'knowledge-base.md'), 'utf-8');

// 转义模板字符串中的特殊字符
function escapeForTemplate(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

const promptsContent = `/**
 * prompts.js - 自动生成文件（由 build-prompts.js 生成）
 * 将 skill.md 和 knowledge-base.md 转为 JS 模块导出，
 * 供 Cloudflare Pages Functions 使用。
 *
 * ⚠️ 不要手动编辑此文件，运行 node build-prompts.js 重新生成
 */

export const SKILL_MD = \`${escapeForTemplate(skillMd)}\`;

export const KNOWLEDGE_BASE_MD = \`${escapeForTemplate(kbMd)}\`;
`;

const outPath = path.join(root, 'functions', 'prompts.js');
fs.writeFileSync(outPath, promptsContent, 'utf-8');

const skillSize = (Buffer.byteLength(skillMd, 'utf-8') / 1024).toFixed(1);
const kbSize = (Buffer.byteLength(kbMd, 'utf-8') / 1024).toFixed(1);
console.log(`✅ prompts.js 已生成: skill.md=${skillSize}KB, knowledge-base.md=${kbSize}KB`);
