import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const RDF_ACCEPT = [
  'text/turtle',
  'application/trig',
  'application/n-triples',
  'application/n-quads',
  'text/n3',
  'application/ld+json',
  'application/rdf+xml',
].join(', ');
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

function isPrivateIpv4(address) {
  const octets = address.split('.').map(Number);
  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateAddress(address) {
  if (isIP(address) === 4) {
    return isPrivateIpv4(address);
  }

  if (isIP(address) !== 6) {
    return true;
  }

  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length);
    return isIP(mappedIpv4) === 4 ? isPrivateIpv4(mappedIpv4) : true;
  }

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized)
  );
}

async function validatePublicRdfUrl(rawUrl) {
  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    throw new Error('The RDF resource URL is invalid.');
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    throw new Error('Only HTTP(S) RDF resources can be loaded.');
  }
  if (targetUrl.username || targetUrl.password) {
    throw new Error('RDF resource URLs may not contain credentials.');
  }
  if (targetUrl.hostname === 'localhost' || targetUrl.hostname.endsWith('.localhost')) {
    throw new Error('Local RDF resource URLs are not allowed.');
  }

  const addresses = await lookup(targetUrl.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Private-network RDF resource URLs are not allowed.');
  }

  return targetUrl;
}

async function fetchPublicRdf(rawUrl, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error('The RDF resource redirected too many times.');
  }

  const targetUrl = await validatePublicRdfUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      headers: { Accept: RDF_ACCEPT },
      redirect: 'manual',
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        return fetchPublicRdf(new URL(location, targetUrl).href, redirectCount + 1);
      }
    }

    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of response.body ?? []) {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        throw new Error('The RDF resource response is too large.');
      }
      chunks.push(Buffer.from(chunk));
    }

    return {
      body: Buffer.concat(chunks),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      status: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function proxyRdfResource(request, response) {
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end('Method not allowed.');
    return;
  }

  const requestUrl = new URL(request.url, 'http://localhost');
  const target = requestUrl.searchParams.get('url');
  if (!target) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Missing RDF resource URL.');
    return;
  }

  try {
    const upstreamResponse = await fetchPublicRdf(target);
    response.writeHead(upstreamResponse.status, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      'Content-Type': upstreamResponse.contentType,
    });
    response.end(upstreamResponse.body);
  } catch (error) {
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      message: 'RDF resource request failed.',
      detail: error instanceof Error ? error.message : String(error),
    }));
  }
}
