const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { checkReleaseMetadata } = require('./check-release-metadata');

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tracemind-${name}-`));
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeJson(root, relativePath, value) {
  writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeReleaseMetadataFixture(root, {
  webReleaseId = '2026.06.01.1',
  guidanceVersion = '2026.06.01.1',
  publicSkillVersion = guidanceVersion,
  snippetVersion = guidanceVersion,
  manifestVersion = guidanceVersion,
  codexSkillVersion = guidanceVersion,
  docsWebReleaseId = webReleaseId,
  serverUsesCanonicalGuidance = true,
  serverUsesCanonicalWebRelease = true,
  deploySkillHasGate = true,
} = {}) {
  writeFile(root, 'imports/api/release_metadata.js', `
export const CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID = '${webReleaseId}';
export const CURRENT_AGENT_GUIDANCE_VERSION = '${guidanceVersion}';
`);
  writeFile(root, 'imports/api/tracemind.js', `
export {
  CURRENT_AGENT_GUIDANCE_VERSION,
  CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID,
} from './release_metadata';
`);
  const serverLines = [];
  if (serverUsesCanonicalGuidance || serverUsesCanonicalWebRelease) {
    const imports = [
      ...(serverUsesCanonicalGuidance ? ['CURRENT_AGENT_GUIDANCE_VERSION'] : []),
      ...(serverUsesCanonicalWebRelease ? ['CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID'] : []),
    ];
    serverLines.push(`import { ${imports.join(', ')} } from '../imports/api/tracemind';`);
  }
  serverLines.push(serverUsesCanonicalGuidance
    ? 'const AGENT_GUIDANCE_VERSION = CURRENT_AGENT_GUIDANCE_VERSION;'
    : "const AGENT_GUIDANCE_VERSION = '2026.05.28.1';");
  serverLines.push(serverUsesCanonicalWebRelease
    ? "export function clientScript() { return `var SCRIPT_RELEASE_ID = '${CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID}';`; }"
    : "export function clientScript() { return \"var SCRIPT_RELEASE_ID = '2026.05.28.1';\"; }");
  writeFile(root, 'server/capture_routes.js', `${serverLines.join('\n')}\n`);
  writeFile(root, 'public/agents/tracemind/SKILL.md', `---\nname: tracemind-instrumentation\nversion: ${publicSkillVersion}\n---\n`);
  writeFile(root, 'public/agents/tracemind/AGENTS_SNIPPET.md', `Guidance version: \`${snippetVersion}\`\n`);
  writeJson(root, 'public/agents/tracemind/manifest.json', { guidanceVersion: manifestVersion });
  writeFile(root, '.codex/skills/tracemind/SKILL.md', `---\nname: tracemind-instrumentation\nversion: ${codexSkillVersion}\n---\n`);
  writeFile(root, 'docs/mcp_design.md', `
{
  "latestReleaseId": "${docsWebReleaseId}",
  "verificationSteps": [
    "Open the customer app and confirm window.TraceMind.status().scriptReleaseId === \\"${docsWebReleaseId}\\"."
  ]
}
`);
  writeFile(root, '.codex/skills/deploy/SKILL.md', deploySkillHasGate
    ? 'Run `npm run check:release-metadata` before deploy and verify `/capture.js` scriptReleaseId.\n'
    : 'Run release checks before deploy.\n');
}

test('checkReleaseMetadata accepts matching release markers', () => {
  const root = tempDir('release-metadata-ok');
  writeReleaseMetadataFixture(root);

  assert.deepEqual(checkReleaseMetadata({ cwd: root }), {
    ok: true,
    webCaptureScriptReleaseId: '2026.06.01.1',
    agentGuidanceVersion: '2026.06.01.1',
  });
});

test('checkReleaseMetadata rejects stale Web capture release docs', () => {
  const root = tempDir('release-metadata-web-stale');
  writeReleaseMetadataFixture(root, { docsWebReleaseId: '2026.05.28.1' });

  assert.throws(
    () => checkReleaseMetadata({ cwd: root }),
    /docs\/mcp_design\.md latestReleaseId must be 2026\.06\.01\.1/,
  );
});

test('checkReleaseMetadata rejects mismatched public agent guidance versions', () => {
  const root = tempDir('release-metadata-guidance-stale');
  writeReleaseMetadataFixture(root, { manifestVersion: '2026.05.28.1' });

  assert.throws(
    () => checkReleaseMetadata({ cwd: root }),
    /public\/agents\/tracemind\/manifest\.json guidanceVersion must be 2026\.06\.01\.1/,
  );
});

test('checkReleaseMetadata rejects deploy guidance without the metadata gate', () => {
  const root = tempDir('release-metadata-deploy-skill');
  writeReleaseMetadataFixture(root, { deploySkillHasGate: false });

  assert.throws(
    () => checkReleaseMetadata({ cwd: root }),
    /\$deploy skill must run npm run check:release-metadata/,
  );
});

test('checkReleaseMetadata rejects hard-coded Web capture release ids in capture routes', () => {
  const root = tempDir('release-metadata-web-hardcoded');
  writeReleaseMetadataFixture(root, { serverUsesCanonicalWebRelease: false });

  assert.throws(
    () => checkReleaseMetadata({ cwd: root }),
    /server\/capture_routes\.js must use CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID/,
  );
});
