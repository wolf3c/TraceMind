const fs = require('node:fs');
const path = require('node:path');

function readText(cwd, relativePath) {
  return fs.readFileSync(path.join(cwd, relativePath), 'utf8');
}

function readJson(cwd, relativePath) {
  return JSON.parse(readText(cwd, relativePath));
}

function extract(text, regex, label) {
  const match = regex.exec(text);
  if (!match) throw new Error(`Missing ${label}.`);
  return match[1];
}

function extractAll(text, regex) {
  const values = [];
  let match = regex.exec(text);
  while (match) {
    values.push(match[1]);
    match = regex.exec(text);
  }
  return values;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${expected}; found ${actual || '(missing)'}.`);
  }
}

function assertContains(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

function assertNotContains(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message);
}

function releaseMetadata(cwd) {
  const text = readText(cwd, 'imports/api/release_metadata.js');
  const webCaptureScriptReleaseId = extract(
    text,
    /export\s+const\s+CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID\s*=\s*'([^']+)'/,
    'CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID',
  );
  const agentGuidanceVersion = extract(
    text,
    /export\s+const\s+CURRENT_AGENT_GUIDANCE_VERSION\s*=\s*'([^']+)'/,
    'CURRENT_AGENT_GUIDANCE_VERSION',
  );
  const releasePattern = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;
  if (!releasePattern.test(webCaptureScriptReleaseId)) {
    throw new Error(`CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID must use YYYY.MM.DD.N format; found ${webCaptureScriptReleaseId}.`);
  }
  if (!releasePattern.test(agentGuidanceVersion)) {
    throw new Error(`CURRENT_AGENT_GUIDANCE_VERSION must use YYYY.MM.DD.N format; found ${agentGuidanceVersion}.`);
  }
  return { webCaptureScriptReleaseId, agentGuidanceVersion };
}

function checkReleaseMetadata({ cwd = process.cwd() } = {}) {
  const {
    webCaptureScriptReleaseId,
    agentGuidanceVersion,
  } = releaseMetadata(cwd);

  const tracemindApi = readText(cwd, 'imports/api/tracemind.js');
  assertContains(
    tracemindApi,
    /from\s+['"]\.\/release_metadata['"]/,
    'imports/api/tracemind.js must re-export release metadata from imports/api/release_metadata.js.',
  );
  assertNotContains(
    tracemindApi,
    /export\s+const\s+CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID\s*=\s*['"]/,
    'CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID must only be defined in imports/api/release_metadata.js.',
  );

  const captureRoutes = readText(cwd, 'server/capture_routes.js');
  assertContains(
    captureRoutes,
    /CURRENT_AGENT_GUIDANCE_VERSION/,
    'server/capture_routes.js must use CURRENT_AGENT_GUIDANCE_VERSION from release metadata.',
  );
  assertContains(
    captureRoutes,
    /CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID/,
    'server/capture_routes.js must use CURRENT_WEB_CAPTURE_SCRIPT_RELEASE_ID from release metadata.',
  );
  assertNotContains(
    captureRoutes,
    /const\s+AGENT_GUIDANCE_VERSION\s*=\s*['"]/,
    'AGENT_GUIDANCE_VERSION must not be a local string literal.',
  );
  assertNotContains(
    captureRoutes,
    /SCRIPT_RELEASE_ID\s*=\s*['"]\d{4}\.\d{2}\.\d{2}\.\d+['"]/,
    'Web Capture SCRIPT_RELEASE_ID must not be a local string literal.',
  );

  const publicSkillVersion = extract(
    readText(cwd, 'public/agents/tracemind/SKILL.md'),
    /^version:\s*([0-9.]+)$/m,
    'public Skill version',
  );
  assertEqual(publicSkillVersion, agentGuidanceVersion, 'public/agents/tracemind/SKILL.md version');

  const snippetVersion = extract(
    readText(cwd, 'public/agents/tracemind/AGENTS_SNIPPET.md'),
    /Guidance version:\s*`([0-9.]+)`/,
    'AGENTS snippet guidance version',
  );
  assertEqual(snippetVersion, agentGuidanceVersion, 'public/agents/tracemind/AGENTS_SNIPPET.md guidance version');

  const manifestVersion = readJson(cwd, 'public/agents/tracemind/manifest.json').guidanceVersion;
  assertEqual(manifestVersion, agentGuidanceVersion, 'public/agents/tracemind/manifest.json guidanceVersion');

  const codexSkillVersion = extract(
    readText(cwd, '.codex/skills/tracemind/SKILL.md'),
    /^version:\s*([0-9.]+)$/m,
    'local Codex TraceMind Skill version',
  );
  assertEqual(codexSkillVersion, agentGuidanceVersion, '.codex/skills/tracemind/SKILL.md version');

  const mcpDesign = readText(cwd, 'docs/mcp_design.md');
  extractAll(mcpDesign, /"latestReleaseId":\s*"([0-9.]+)"/g).forEach((value) => {
    assertEqual(value, webCaptureScriptReleaseId, 'docs/mcp_design.md latestReleaseId');
  });
  extractAll(mcpDesign, /scriptReleaseId === \\"([0-9.]+)\\"/g).forEach((value) => {
    assertEqual(value, webCaptureScriptReleaseId, 'docs/mcp_design.md scriptReleaseId verification example');
  });

  const deploySkill = readText(cwd, '.codex/skills/deploy/SKILL.md');
  assertContains(
    deploySkill,
    /npm run check:release-metadata/,
    '$deploy skill must run npm run check:release-metadata.',
  );
  assertContains(
    deploySkill,
    /scriptReleaseId/,
    '$deploy skill must verify the deployed /capture.js scriptReleaseId.',
  );

  return {
    ok: true,
    webCaptureScriptReleaseId,
    agentGuidanceVersion,
  };
}

if (require.main === module) {
  try {
    const result = checkReleaseMetadata();
    console.log(`Release metadata OK: webCaptureScriptReleaseId=${result.webCaptureScriptReleaseId}, agentGuidanceVersion=${result.agentGuidanceVersion}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  checkReleaseMetadata,
  releaseMetadata,
};
