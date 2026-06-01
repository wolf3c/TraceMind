const {
  readWebCaptureScriptReleaseId,
  sha256,
} = require('./capture-static-assets');

const DEFAULT_CAPTURE_SCRIPT_ORIGIN = 'https://tracemind-capture.pages.dev';
const ENTRY_CACHE_CONTROL = 'public, max-age=60, must-revalidate';
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function normalizeOrigin(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  const url = new URL(text);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Capture script origin must be http or https: ${text}`);
  }
  return url.origin;
}

function headerValue(headers, name) {
  return headers?.get?.(name) || headers?.get?.(name.toLowerCase()) || '';
}

function assertHeaderEquals(headers, name, expected, url) {
  const actual = headerValue(headers, name);
  if (actual !== expected) {
    throw new Error(`${url} expected ${name}: ${expected}, got ${actual || '(missing)'}.`);
  }
}

function assertNoSetCookie(headers, url) {
  if (headerValue(headers, 'set-cookie')) {
    throw new Error(`${url} must not set cookies.`);
  }
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url);
  const body = await response.text();
  return { response, body };
}

async function checkCaptureStaticPublication({
  origin = DEFAULT_CAPTURE_SCRIPT_ORIGIN,
  releaseId = readWebCaptureScriptReleaseId(),
  fetchImpl = fetch,
} = {}) {
  const scriptOrigin = normalizeOrigin(origin);
  const entryUrl = `${scriptOrigin}/capture.js`;
  const entry = await fetchText(entryUrl, fetchImpl);
  if (entry.response.status !== 200) {
    throw new Error(`${entryUrl} expected 200, got ${entry.response.status}.`);
  }
  const contentType = headerValue(entry.response.headers, 'content-type');
  if (!/javascript|ecmascript/i.test(contentType)) {
    throw new Error(`${entryUrl} expected JavaScript content type, got ${contentType || '(missing)'}.`);
  }
  assertHeaderEquals(entry.response.headers, 'cache-control', ENTRY_CACHE_CONTROL, entryUrl);
  assertHeaderEquals(entry.response.headers, 'access-control-allow-origin', '*', entryUrl);
  if (!headerValue(entry.response.headers, 'etag')) {
    throw new Error(`${entryUrl} is missing ETag.`);
  }
  assertNoSetCookie(entry.response.headers, entryUrl);
  if (!entry.body.trim()) {
    throw new Error(`${entryUrl} returned an empty body.`);
  }
  if (!entry.body.includes(releaseId)) {
    throw new Error(`${entryUrl} does not include scriptReleaseId ${releaseId}.`);
  }

  const hash = sha256(entry.body);
  const immutableUrl = `${scriptOrigin}/capture.${hash}.js`;
  const immutable = await fetchText(immutableUrl, fetchImpl);
  if (immutable.response.status !== 200) {
    throw new Error(`${immutableUrl} expected 200, got ${immutable.response.status}.`);
  }
  assertHeaderEquals(immutable.response.headers, 'cache-control', IMMUTABLE_CACHE_CONTROL, immutableUrl);
  assertHeaderEquals(immutable.response.headers, 'access-control-allow-origin', '*', immutableUrl);
  assertNoSetCookie(immutable.response.headers, immutableUrl);
  if (immutable.body !== entry.body) {
    throw new Error(`${immutableUrl} body differs from ${entryUrl}.`);
  }

  return {
    origin: scriptOrigin,
    entryUrl,
    immutableUrl,
    releaseId,
    hash,
    bytes: Buffer.byteLength(entry.body),
    etag: headerValue(entry.response.headers, 'etag'),
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--origin') {
      options.origin = argv[index + 1];
      index += 1;
    } else if (arg === '--release-id') {
      options.releaseId = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await checkCaptureStaticPublication({
    origin: options.origin || process.env.TRACEMIND_CAPTURE_SCRIPT_ORIGIN || DEFAULT_CAPTURE_SCRIPT_ORIGIN,
    releaseId: options.releaseId || readWebCaptureScriptReleaseId(),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_CAPTURE_SCRIPT_ORIGIN,
  checkCaptureStaticPublication,
};
