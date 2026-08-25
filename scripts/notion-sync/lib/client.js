'use strict';

// Minimal Notion REST client. Zero dependencies: global fetch (Node >= 18).
//
// Pinned to Notion-Version 2026-03-11 for the Markdown API
// (GET/PATCH /v1/pages/:id/markdown), which lets Notion's own parser own
// block-diffing — the whole class of shallow-PATCH / no-reorder / recursive
// append bugs in block-JSON sync tools does not exist on this path.
//
// Every endpoint the sync uses is defined here and nowhere else, so if Notion
// adjusts a shape, one file changes.

const NOTION_VERSION = '2026-03-11';
const BASE = 'https://api.notion.com';
const MIN_INTERVAL_MS = 400; // ~2.5 req/s, headroom under Notion's documented ~3/s
const MAX_RETRIES = 5;

function createClient({ token, fetchImpl = fetch, sleepImpl = defaultSleep, minIntervalMs = MIN_INTERVAL_MS }) {
  if (!token) throw new Error('Notion token required (set NOTION_TOKEN or run in --emit degraded mode)');
  let lastRequestAt = 0;

  async function request(method, apiPath, body) {
    for (let attempt = 0; ; attempt += 1) {
      const wait = lastRequestAt + minIntervalMs - Date.now();
      if (wait > 0) await sleepImpl(wait);
      lastRequestAt = Date.now();

      const res = await fetchImpl(`${BASE}${apiPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (res.ok) return parseBody(res);

      const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
      if (!retryable || attempt >= MAX_RETRIES) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Notion API ${method} ${apiPath} failed: HTTP ${res.status} ${detail.slice(0, 300)}`);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30000, 1000 * 2 ** attempt);
      await sleepImpl(backoffMs);
    }
  }

  async function parseBody(res) {
    const type = res.headers.get('content-type') || '';
    return type.includes('application/json') ? res.json() : res.text();
  }

  return {
    /** Page metadata; used for the cheap last_edited_time pre-check before fetching markdown. */
    retrievePage: (pageId) => request('GET', `/v1/pages/${pageId}`),

    /** Full page body as Notion enhanced markdown. */
    getPageMarkdown: async (pageId) => {
      const result = await request('GET', `/v1/pages/${pageId}/markdown`);
      return typeof result === 'string' ? result : result.markdown;
    },

    /** Replace page body from markdown; Notion's parser handles block conversion. */
    patchPageMarkdown: (pageId, markdown) =>
      request('PATCH', `/v1/pages/${pageId}/markdown`, { markdown }),

    /**
     * Create a child page under a parent page, then set its body.
     * Two calls by design: the documented POST /v1/pages shape plus the same
     * markdown PATCH used everywhere else — one body-writing path, not two.
     */
    createPage: async (parentPageId, title, markdown) => {
      const page = await request('POST', '/v1/pages', {
        parent: { page_id: parentPageId },
        properties: { title: { title: [{ text: { content: title } }] } },
      });
      if (markdown) {
        await request('PATCH', `/v1/pages/${page.id}/markdown`, { markdown });
      }
      return page;
    },
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { createClient, NOTION_VERSION };
