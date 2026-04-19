/**
 * NPI Lookup Tool — CORS Proxy (Cloudflare Worker)
 *
 * Proxies three APIs that block direct browser requests:
 *   /nppes/*   → https://npiregistry.cms.hhs.gov/api/
 *   /humana/*  → https://fhir.humana.com/api/
 *   /finder/*  → https://finder.humana.com/finder/
 *
 * The NPPES and FHIR APIs are public CMS-mandated endpoints.
 * The finder API is Humana's provider directory search and requires a
 * browser-like session: a GET to finder.humana.com first to set cookies,
 * then the POST goes with those cookies attached. Without the warmup,
 * finder returns 200 with an empty body.
 */

const TARGETS = {
  '/nppes':  'https://npiregistry.cms.hhs.gov/api',
  '/humana': 'https://fhir.humana.com/api',
  '/finder': 'https://finder.humana.com/finder',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  // Expose diagnostics so the client can read them via response.headers.get()
  'Access-Control-Expose-Headers': 'X-Debug-Upstream-Status, X-Debug-Upstream-Len, X-Debug-Cookies, X-Debug-Target, X-Debug-Cookie-Names, X-Debug-Upstream-Headers, X-Debug-Upstream-Setcookie-Names',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Hit finder.humana.com/finder/medical to get session cookies.
 * Returns a "cookie" header string (just names=values, no attributes).
 */
async function warmupFinderCookies() {
  try {
    const r = await fetch('https://finder.humana.com/finder/medical', {
      method: 'GET',
      headers: {
        'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language':  'en-US,en;q=0.9',
        'User-Agent':       UA,
      },
      redirect: 'follow',
    });
    // Cloudflare Workers: response.headers.getSetCookie() returns an array of Set-Cookie strings.
    const setCookies = typeof r.headers.getSetCookie === 'function'
      ? r.headers.getSetCookie()
      : [];
    // Each entry is like "NAME=VALUE; Path=/; Secure; ..." — we want just NAME=VALUE.
    const pairs = setCookies
      .map(c => c.split(';')[0].trim())
      .filter(Boolean);
    // Also return cookie NAMES (just the keys, for diagnostics)
    const names = pairs.map(p => p.split('=')[0]).join(',');
    return { header: pairs.join('; '), names };
  } catch (e) {
    return { header: '', names: `ERR:${e.message}` };
  }
}

export default {
  async fetch(request) {

    // Preflight — browser sends this before every cross-origin request
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Match /nppes, /humana, or /finder prefix
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
      // Read the POST body to a string up-front — streaming ReadableStream
      // bodies through fetch() inside a Cloudflare Worker can arrive at the
      // upstream with no Content-Length header.
      let requestBody;
      if (request.method === 'POST') {
        requestBody = await request.text();
      }

      // Build upstream headers — chosen to mirror finder.humana.com from a real Chrome session.
      const upstreamHeaders = {
        'Accept':           'application/json, text/plain, */*',
        'Accept-Language':  'en-US,en;q=0.9',
        'User-Agent':       UA,
      };
      if (request.method === 'POST') {
        upstreamHeaders['Content-Type'] = request.headers.get('Content-Type') || 'application/json';
      }

      // Per-target customizations.
      let cookieHeader = '';
      let cookieNames = '';
      if (targetBase.includes('finder.humana.com')) {
        upstreamHeaders['Origin']  = 'https://finder.humana.com';
        upstreamHeaders['Referer'] = 'https://finder.humana.com/finder/medical/results';
        // Finder's API refuses (returns 200 empty) unless a session cookie is present.
        // Warm up by hitting the main page first, then forward those cookies.
        const warm = await warmupFinderCookies();
        cookieHeader = warm.header;
        cookieNames  = warm.names;
        if (cookieHeader) {
          upstreamHeaders['Cookie'] = cookieHeader;
        }
      } else if (targetBase.includes('fhir.humana.com')) {
        upstreamHeaders['Accept'] = 'application/fhir+json, application/json';
      }

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body: requestBody, // may be undefined for GET
      });

      const body = await response.text();

      // Collect interesting upstream response headers for diagnostics.
      const interesting = ['server', 'x-akamai-transformed', 'x-cache', 'x-cache-remote',
                           'akamai-cache-status', 'x-request-id', 'x-amzn-requestid',
                           'www-authenticate'];
      const upstreamHeadersOut = {};
      for (const name of interesting) {
        const v = response.headers.get(name);
        if (v) upstreamHeadersOut[name] = v;
      }
      // Count Set-Cookie headers returned by upstream (can reveal challenges)
      const upstreamSetCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];

      const respHeaders = {
        ...CORS_HEADERS,
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        // Diagnostic headers — read from client with response.headers.get(...)
        'X-Debug-Upstream-Status':  String(response.status),
        'X-Debug-Upstream-Len':     String(body.length),
        'X-Debug-Target':           targetUrl,
        'X-Debug-Upstream-Headers': JSON.stringify(upstreamHeadersOut),
        'X-Debug-Upstream-Setcookie-Names': upstreamSetCookies.map(c => c.split('=')[0]).join(','),
      };
      if (targetBase.includes('finder.humana.com')) {
        respHeaders['X-Debug-Cookies']       = cookieHeader ? `len=${cookieHeader.length}` : 'none';
        respHeaders['X-Debug-Cookie-Names']  = cookieNames || '';
      }

      return new Response(body, {
        status: response.status,
        headers: respHeaders,
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Proxy error', detail: err.message }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }
};
