const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildCaptureStaticFiles,
  captureStaticHeaders,
} = require('./capture-static-assets');

test('buildCaptureStaticFiles writes the stable entry, immutable asset, and Pages headers', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracemind-capture-static-'));
  const body = 'window.TraceMind = { release: "2026.06.01.1" };\n';
  const hash = crypto.createHash('sha256').update(body).digest('hex');

  const result = buildCaptureStaticFiles({ body, outputDir });

  assert.equal(result.hash, hash);
  assert.equal(result.entryPath, 'capture.js');
  assert.equal(result.hashedPath, `capture.${hash}.js`);
  assert.equal(result.headersPath, '_headers');
  assert.deepEqual(result.files.sort(), [
    '_headers',
    'capture.js',
    `capture.${hash}.js`,
  ].sort());
  assert.equal(fs.readFileSync(path.join(outputDir, 'capture.js'), 'utf8'), body);
  assert.equal(fs.readFileSync(path.join(outputDir, `capture.${hash}.js`), 'utf8'), body);
  assert.equal(fs.readFileSync(path.join(outputDir, '_headers'), 'utf8'), captureStaticHeaders());
});

test('captureStaticHeaders matches the Cloudflare Pages cache contract exactly', () => {
  assert.equal(captureStaticHeaders(), [
    '/capture.js',
    '  Cache-Control: public, max-age=60, must-revalidate',
    '  Access-Control-Allow-Origin: *',
    '',
    '/capture.*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '  Access-Control-Allow-Origin: *',
    '',
  ].join('\n'));
});
