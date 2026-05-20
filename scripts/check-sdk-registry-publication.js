#!/usr/bin/env node

const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { assertPackageVersion, releaseTagForVersion } = require('./prepare-sdk-release-ref');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function registryCheckUrl(registry = {}) {
  const version = registry.packageVersion;
  if (registry.type === 'npm') {
    const encoded = encodeURIComponent(registry.packageName).replace(/^%40/, '@');
    return `https://registry.npmjs.org/${encoded}/${version}`;
  }
  if (registry.type === 'pypi') {
    return `https://pypi.org/pypi/${registry.packageName}/${version}/json`;
  }
  if (registry.type === 'maven_central') {
    const groupPath = String(registry.groupId || '').replace(/\./g, '/');
    return `https://repo1.maven.org/maven2/${groupPath}/${registry.artifactId}/${version}/${registry.artifactId}-${version}.pom`;
  }
  throw new Error(`Unsupported SDK registry type: ${registry.type || '(missing)'}`);
}

function defaultFetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'tracemind-sdk-registry-gate' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(body);
          return;
        }
        reject(new Error(`Registry probe failed for ${url}: HTTP ${response.statusCode}`));
      });
    }).on('error', reject);
  });
}

function gh(cwd, args) {
  return execFileSync('gh', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listGithubWorkflowRuns({ cwd, workflow }) {
  const output = gh(cwd, [
    'run',
    'list',
    '--workflow',
    workflow,
    '--event',
    'push',
    '--limit',
    '50',
    '--json',
    'databaseId,headBranch,status,conclusion,name,url',
  ]);
  return JSON.parse(output || '[]');
}

async function checkGithubWorkflow({
  cwd,
  tag,
  workflow = 'sdk-publish.yml',
  waitMs = 20 * 60 * 1000,
  pollMs = 30 * 1000,
  listRuns = listGithubWorkflowRuns,
  sleepFn = sleep,
  now = Date.now,
}) {
  const startedAt = now();
  let lastRun = null;
  while (true) {
    const runs = await listRuns({ cwd, workflow });
    const run = runs.find((entry) => entry.headBranch === tag);
    lastRun = run || lastRun;
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success') {
        throw new Error(`SDK registry publish workflow ${workflow} for ${tag} ended with ${run.conclusion}. Do not deploy.`);
      }
      return run;
    }
    if (now() - startedAt >= waitMs) break;
    await sleepFn(pollMs);
  }

  if (!lastRun) {
    throw new Error(`SDK registry publish workflow ${workflow} has no run for ${tag} after ${Math.round(waitMs / 1000)}s. Do not deploy.`);
  }
  throw new Error(`SDK registry publish workflow ${workflow} for ${tag} is ${lastRun.status} after ${Math.round(waitMs / 1000)}s. Do not deploy.`);
}

function assertRegistryMetadata(sdk) {
  const registry = sdk.registry || {};
  if (!registry.type || !registry.packageName || !registry.packageVersion) {
    throw new Error(`${sdk.sdkName} missing registry package metadata.`);
  }
  if (registry.type === 'maven_central' && (!registry.groupId || !registry.artifactId)) {
    throw new Error(`${sdk.sdkName} missing Maven Central groupId or artifactId.`);
  }
}

async function checkSdkRegistryPublication({
  cwd = process.cwd(),
  version,
  checkWorkflow = true,
  workflowWaitMs,
  workflowPollMs,
  listWorkflowRuns,
  sleepFn,
  now,
  fetchText = defaultFetchText,
} = {}) {
  const tag = releaseTagForVersion(version);
  assertPackageVersion(version, cwd);

  const manifestPath = path.join(cwd, 'sdk/release_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Missing sdk/release_manifest.json. Run npm run prepare:sdk-release-ref before deploying.');
  }
  const manifest = readJson(manifestPath);
  if (manifest.sourceRef !== tag) {
    throw new Error(`sdk/release_manifest.json sourceRef must be ${tag} before registry publication check.`);
  }

  const registrySdks = (manifest.sdks || [])
    .filter((sdk) => sdk.distributionMode === 'registry')
    .sort((left, right) => left.sdkName.localeCompare(right.sdkName));
  const skippedLocalSourceSdks = (manifest.sdks || [])
    .filter((sdk) => sdk.distributionMode !== 'registry').length;

  if (!registrySdks.length) {
    throw new Error('No registry SDKs found in sdk/release_manifest.json.');
  }

  const workflowRun = checkWorkflow ? await checkGithubWorkflow({
    cwd,
    tag,
    waitMs: workflowWaitMs,
    pollMs: workflowPollMs,
    listRuns: listWorkflowRuns,
    sleepFn,
    now,
  }) : null;

  for (const sdk of registrySdks) {
    assertRegistryMetadata(sdk);
    await fetchText(registryCheckUrl(sdk.registry));
  }

  return {
    ok: true,
    tag,
    workflowRun,
    checkedSdks: registrySdks.map((sdk) => sdk.sdkName),
    skippedLocalSourceSdks,
  };
}

if (require.main === module) {
  const version = process.argv[2];
  checkSdkRegistryPublication({ version })
    .then((result) => {
      console.log(`SDK registry publication is ready for ${result.tag}: ${result.checkedSdks.join(', ')}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

module.exports = {
  checkGithubWorkflow,
  checkSdkRegistryPublication,
  registryCheckUrl,
};
