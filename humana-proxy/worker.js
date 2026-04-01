/**
 * NPI Lookup Tool — CORS Proxy (Cloudflare Worker)
 *
 * Proxies two APIs that block direct browser requests:
 *   /nppes/*   → https://npiregistry.cms.hhs.gov/api/
 *   /humana/*  → https://fhir.humana.com/api/
 *
 * Both are public APIs required by CMS rules — the proxy simply adds
 * the CORS headers the browser needs to call them.
 */

const TARGETS = {
  '/nppes':  'https://npiregistry.cms.hhs.gov/api',
  '/humana': 'https://fhir.humana.com/api',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
};

export default {
  async fetch(request) {

    // Preflight — browser sends this before every cross-origin request
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Match /nppes or /humana prefix
    let targetBase = null;
    let strippedPath = url.pathname;

    for (const [prefix, base] of Object.entries(TARGETS)) {
      if (url.pathname.startsWith(prefix)) {
        targetBase = base;
        strippedPath = url.pathname.slice(prefix.length) || '/';
        break;
      }
    }

    if (!targetBase) {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }

    const targetUrl = targetBase + strippedPath + url.search;

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/fhir+json, application/json',
          'User-Agent': 'NPI-Lookup-Tool/2.5',
        },
      });

      const body = await response.text();

      return new Response(body, {
        status: response.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': response.headers.get('Content-Type') || 'application/json',
        },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Proxy error', detail: err.message }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }
};
