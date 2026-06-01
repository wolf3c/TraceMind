const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CAPTURE_STATIC_SOURCE_URL = 'https://tracemind.sandbox.galaxycloud.app/capture.js';

function sha256(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

function captureStaticHeaders() {
  return [
    '/capture.js',
    '  Cache-Control: public, max-age=60, must-revalidate',
    '  Access-Control-Allow-Origin: *',
    '',
    '/capture.*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '  Access-Control-Allow-Origin: *',
    '',
  ].join('\n');
}

function buildCaptureStaticFiles({ body, outputDir }) {
  const scriptBody = String(body || '');
  if (!scriptBody.trim()) {
    throw new Error('Cannot build capture static files from an empty capture.js body.');
  }
  if (!outputDir) {
    throw new Error('Missing outputDir for capture static files.');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const hash = sha256(scriptBody);
  const entryPath = 'capture.js';
  const hashedPath = `capture.${hash}.js`;
  const headersPath = '_headers';

  fs.writeFileSync(path.join(outputDir, entryPath), scriptBody);
  fs.writeFileSync(path.join(outputDir, hashedPath), scriptBody);
  fs.writeFileSync(path.join(outputDir, headersPath), captureStaticHeaders());

  return {
    outputDir,
    hash,
    entryPath,
    hashedPath,
    headersPath,
    files: [entryPath, hashedPath, headersPath],
    bytes: Buffer.byteLength(scriptBody),
    etag: `"sha256-${hash}"`,
  };
}

function readPackageVersion(rootDir = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  return pkg.version;
}

function readWebCaptureScriptReleaseId(rootDir = process.cwd()) {
  const metadata = fs.readFileSync(path.join(rootDir, 'imports/api/release_metadata.js'), 'utf8');
  const match = metadata.match(/CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID\s*=\s*'([^']+)'/);
  if (!match) throw new Error('Could not read CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID from imports/api/release_metadata.js.');
  return match[1];
}

function defaultOutputDir(rootDir = process.cwd()) {
  return path.join(rootDir, '.codex/scratch/capture-static', readPackageVersion(rootDir));
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source-url') {
      options.sourceUrl = argv[index + 1];
      index += 1;
    } else if (arg === '--output-dir') {
      options.outputDir = argv[index + 1];
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

async function fetchCaptureScriptBody({ sourceUrl, releaseId, fetchImpl = fetch }) {
  const response = await fetchImpl(sourceUrl);
  if (!response || response.status !== 200) {
    throw new Error(`Expected ${sourceUrl} to return 200, got ${response?.status || 'no response'}.`);
  }
  const contentType = response.headers?.get?.('content-type') || '';
  if (!/javascript|ecmascript|text\/plain/i.test(contentType)) {
    throw new Error(`Expected JavaScript content from ${sourceUrl}, got ${contentType || '(missing content-type)'}.`);
  }
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`Fetched empty capture script body from ${sourceUrl}.`);
  }
  if (releaseId && !body.includes(releaseId)) {
    throw new Error(`Fetched capture script does not include scriptReleaseId ${releaseId}.`);
  }
  if (!body.includes('/api/capture')) {
    throw new Error('Fetched capture script does not include the Galaxy /api/capture endpoint path.');
  }
  return body;
}

async function main() {
  const rootDir = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  const releaseId = options.releaseId || readWebCaptureScriptReleaseId(rootDir);
  const sourceUrl = options.sourceUrl || process.env.TRACEMIND_CAPTURE_STATIC_SOURCE_URL || DEFAULT_CAPTURE_STATIC_SOURCE_URL;
  const outputDir = options.outputDir || process.env.TRACEMIND_CAPTURE_STATIC_OUTPUT_DIR || defaultOutputDir(rootDir);
  const body = await fetchCaptureScriptBody({ sourceUrl, releaseId });
  const result = buildCaptureStaticFiles({ body, outputDir });
  process.stdout.write(`${JSON.stringify({
    outputDir: result.outputDir,
    sourceUrl,
    releaseId,
    hash: result.hash,
    files: result.files,
    bytes: result.bytes,
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_CAPTURE_STATIC_SOURCE_URL,
  buildCaptureStaticFiles,
  captureStaticHeaders,
  defaultOutputDir,
  fetchCaptureScriptBody,
  readWebCaptureScriptReleaseId,
  sha256,
};
