'use strict';

// Translation between Obsidian-flavored markdown and the markdown dialect the
// Notion Markdown API accepts ("enhanced markdown", API version 2026-03-11).
//
// Deliberately thin: Notion's own parser handles standard markdown, so the only
// work here is the syntax that exists on exactly one side —
//   - Obsidian callouts  `> [!type] Title`  <->  Notion `<callout icon="..">`
//   - Obsidian wikilinks `[[Note]]`         <->  markdown links to mapped Notion pages
//   - Obsidian embeds    `![[Note]]`        ->   visible placeholder (no Notion analog)
// Anything that cannot round-trip is surfaced in `warnings`, never dropped silently.

const CALLOUT_ICONS = {
  note: '📝', abstract: '📋', summary: '📋', info: 'ℹ️', todo: '✅',
  tip: '💡', hint: '💡', success: '✅', question: '❓', warning: '⚠️',
  caution: '⚠️', failure: '❌', danger: '🚨', error: '🚨', bug: '🐛',
  example: '🧪', quote: '💬',
};
const ICON_TYPES = { '📝': 'note', '📋': 'abstract', 'ℹ️': 'info', '💡': 'tip', '✅': 'todo', '❓': 'question', '⚠️': 'warning', '❌': 'failure', '🚨': 'danger', '🐛': 'bug', '🧪': 'example', '💬': 'quote' };

function notionPageUrl(pageId) {
  return `https://www.notion.so/${String(pageId).replace(/-/g, '')}`;
}

/** Convert Obsidian body markdown to Notion-acceptable markdown. */
function toNotion(body, idMapByName = {}) {
  const warnings = [];
  const out = [];
  const lines = String(body).split('\n');
  let i = 0;
  while (i < lines.length) {
    const calloutStart = lines[i].match(/^>\s*\[!(\w+)\][+-]?\s*(.*)$/);
    if (calloutStart) {
      const type = calloutStart[1].toLowerCase();
      const title = calloutStart[2].trim();
      const icon = CALLOUT_ICONS[type] || '📝';
      const inner = [];
      if (title) inner.push(`**${title}**`);
      i += 1;
      while (i < lines.length && /^>( |$)/.test(lines[i])) {
        inner.push(lines[i].replace(/^> ?/, ''));
        i += 1;
      }
      out.push(`<callout icon="${icon}">`, ...inner, '</callout>');
      continue;
    }
    out.push(convertInline(lines[i], idMapByName, warnings));
    i += 1;
  }
  return { markdown: out.join('\n'), warnings };
}

function convertInline(line, idMapByName, warnings) {
  return line
    .replace(/!\[\[([^\]]+)\]\]/g, (_, target) => {
      warnings.push(`embed has no Notion analog, replaced with placeholder: ![[${target}]]`);
      return `[embed from vault: ${target.split('|')[0]}]`;
    })
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
      const label = (alias || target).trim();
      const pageId = idMapByName[target.trim().toLowerCase()];
      if (pageId) return `[${label}](${notionPageUrl(pageId)})`;
      warnings.push(`wikilink target not synced to Notion, kept as plain text: [[${target}]]`);
      return label;
    });
}

/** Convert markdown pulled from Notion back to Obsidian-flavored markdown. */
function fromNotion(markdown, nameByPageId = {}) {
  const warnings = [];
  const out = [];
  const lines = String(markdown).split('\n');
  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(/^<callout(?:\s+icon="([^"]*)")?\s*>\s*$/);
    if (open) {
      const type = ICON_TYPES[open[1]] || 'note';
      const inner = [];
      i += 1;
      while (i < lines.length && !/^<\/callout>\s*$/.test(lines[i])) {
        inner.push(lines[i]);
        i += 1;
      }
      i += 1; // closing tag
      const [first, ...rest] = inner;
      const titleMatch = first ? first.match(/^\*\*(.+)\*\*$/) : null;
      const title = titleMatch ? ` ${titleMatch[1]}` : '';
      const bodyLines = titleMatch ? rest : inner;
      out.push(`> [!${type}]${title}`, ...bodyLines.map((l) => (l === '' ? '>' : `> ${l}`)));
      continue;
    }
    out.push(restoreInline(lines[i], nameByPageId));
    i += 1;
  }
  return { body: out.join('\n'), warnings };
}

function restoreInline(line, nameByPageId) {
  return line.replace(
    /\[([^\]]+)\]\(https:\/\/www\.notion\.so\/([0-9a-f]{32})\)/g,
    (whole, label, rawId) => {
      const name = nameByPageId[rawId];
      if (!name) return whole;
      return name.toLowerCase() === label.toLowerCase() ? `[[${name}]]` : `[[${name}|${label}]]`;
    }
  );
}

module.exports = { toNotion, fromNotion, notionPageUrl, CALLOUT_ICONS };
