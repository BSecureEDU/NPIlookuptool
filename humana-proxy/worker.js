/**
 * NPI Lookup Tool — CORS Proxy (Cloudflare Worker)
 *
 * Proxies three APIs that block direct browser requests:
 *   /nppes/*   → https://npiregistry.cms.hhs.gov/api/
 *   /humana/*  → https://fhir.humana.com/api/
 *   /finder/*  → https://finder.humana.com/finder/
 *
 * The NPPES and FHIR APIs are public CMS-mandated endpoints.
 * The finder API is Humana's provider directory search (more complete
 * than FHIR — includes providers missing from the FHIR directory).
 * The proxy simply adds the CORS headers the browser needs.
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
};

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
      // Read the POST body to a string up-front — streaming ReadableStream
      // bodies through fetch() inside a Cloudflare Worker can arrive at the
      // upstream with no Content-Length header, which the Humana Finder API
      // treats as an empty request (returns 200 with an empty body).
      let requestBody;
      if (request.method === 'POST') {
        requestBody = await request.text();
      }

      // Build upstream headers — chosen to mirror what finder.humana.com sends
      // from a real Chrome session.
      const upstreamHeaders = {
        'Accept':           'application/json, text/plain, */*',
        'Accept-Language':  'en-US,en;q=0.9',
        'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      };
      if (request.method === 'POST') {
        upstreamHeaders['Content-Type'] = request.headers.get('Content-Type') || 'application/json';
      }
      // Finder + FHIR APIs expect requests to appear as if they come from Humana's own portal.
      if (targetBase.includes('finder.humana.com')) {
        upstreamHeaders['Origin']  = 'https://finder.humana.com';
        upstreamHeaders['Referer'] = 'https://finder.humana.com/finder/medical/results';
      } else if (targetBase.includes('fhir.humana.com')) {
        upstreamHeaders['Accept'] = 'application/fhir+json, application/json';
      }

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body: requestBody, // may be undefined for GET
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
