const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  checkGithubWorkflow,
  checkSdkRegistryPublication,
  registryCheckUrl,
} = require('./check-sdk-registry-publication');

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tracemind-${name}-`));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writePackage(repo, version = '2026.5.20-1') {
  writeJson(path.join(repo, 'package.json'), { name: 'TraceMind', version });
}

function writeManifest(repo, manifest) {
  writeJson(path.join(repo, 'sdk/release_manifest.json'), manifest);
}

function registrySdk(sdkName, registry) {
  return {
    sdkName,
    displayVersion: '0.1.0',
    contentHash: `sha256:${sdkName.padEnd(64, '0').slice(0, 64)}`,
    sourceRef: 'tracemind-release-2026.5.20-1',
    distributionMode: 'registry',
    publishStatus: 'published',
    registry: {
      packageVersion: '2026.5.20-1',
      ...registry,
    },
  };
}

test('registryCheckUrl builds package-manager registry probes', () => {
  assert.equal(
    registryCheckUrl({ type: 'npm', packageName: '@tracemind/server-node', packageVersion: '2026.5.20-1' }),
    'https://registry.npmjs.org/@tracemind%2Fserver-node/2026.5.20-1',
  );
  assert.equal(
    registryCheckUrl({ type: 'pypi', packageName: 'tracemind-server', packageVersion: '2026.5.20-1' }),
    'https://pypi.org/pypi/tracemind-server/2026.5.20-1/json',
  );
  assert.equal(
    registryCheckUrl({
      type: 'maven_central',
      groupId: 'io.github.wolf3c.tracemind',
      artifactId: 'tracemind-android',
      packageVersion: '2026.5.20-1',
    }),
    'https://repo1.maven.org/maven2/io/github/wolf3c/tracemind/tracemind-android/2026.5.20-1/tracemind-android-2026.5.20-1.pom',
  );
});

test('checkSdkRegistryPublication verifies registry SDKs and ignores local-source Swift', async () => {
  const repo = tempDir('sdk-registry-gate');
  writePackage(repo);
  writeManifest(repo, {
    manifestVersion: 1,
    sourceRef: 'tracemind-release-2026.5.20-1',
    sdks: [
      {
        sdkName: 'swift',
        displayVersion: '0.1.0',
        contentHash: `sha256:${'swift'.padEnd(64, '0').slice(0, 64)}`,
        sourceRef: 'tracemind-release-2026.5.20-1',
        distributionMode: 'local_source',
        publishStatus: 'not_published',
      },
      registrySdk('server_node', { type: 'npm', packageName: '@tracemind/server-node' }),
      registrySdk('server_python', { type: 'pypi', packageName: 'tracemind-server' }),
      registrySdk('android', {
        type: 'maven_central',
        packageName: 'io.github.wolf3c.tracemind:tracemind-android',
        groupId: 'io.github.wolf3c.tracemind',
        artifactId: 'tracemind-android',
      }),
    ],
  });

  const urls = [];
  const result = await checkSdkRegistryPublication({
    cwd: repo,
    version: '2026.5.20-1',
    checkWorkflow: false,
    fetchText: async (url) => {
      urls.push(url);
      return '{}';
    },
  });

  assert.deepEqual(result.checkedSdks, ['android', 'server_node', 'server_python']);
  assert.equal(result.skippedLocalSourceSdks, 1);
  assert.deepEqual(urls.sort(), [
    'https://pypi.org/pypi/tracemind-server/2026.5.20-1/json',
    'https://registry.npmjs.org/@tracemind%2Fserver-node/2026.5.20-1',
    'https://repo1.maven.org/maven2/io/github/wolf3c/tracemind/tracemind-android/2026.5.20-1/tracemind-android-2026.5.20-1.pom',
  ].sort());
});

test('checkGithubWorkflow waits for the matching release tag run to succeed', async () => {
  const calls = [];
  const result = await checkGithubWorkflow({
    cwd: process.cwd(),
    tag: 'tracemind-release-2026.5.20-1',
    workflow: 'sdk-publish.yml',
    pollMs: 1,
    listRuns: async () => {
      calls.push(true);
      if (calls.length === 1) return [];
      return [{
        headBranch: 'tracemind-release-2026.5.20-1',
        status: 'completed',
        conclusion: 'success',
        url: 'https://github.com/wolf3c/TraceMind/actions/runs/1',
      }];
    },
    sleepFn: async () => {},
    now: () => calls.length,
  });

  assert.equal(result.conclusion, 'success');
  assert.equal(calls.length, 2);
});

test('checkGithubWorkflow can match GitHub tag runs by commit sha', async () => {
  const result = await checkGithubWorkflow({
    cwd: process.cwd(),
    tag: 'tracemind-release-2026.5.20-1',
    workflow: 'sdk-publish.yml',
    resolveTagSha: () => 'abc123',
    listRuns: async () => [{
      event: 'push',
      headBranch: 'main',
      headSha: 'abc123',
      status: 'completed',
      conclusion: 'success',
      url: 'https://github.com/wolf3c/TraceMind/actions/runs/1',
    }],
    sleepFn: async () => {},
  });

  assert.equal(result.conclusion, 'success');
});

test('checkGithubWorkflow rejects failed release tag workflow runs', async () => {
  await assert.rejects(
    () => checkGithubWorkflow({
      cwd: process.cwd(),
      tag: 'tracemind-release-2026.5.20-1',
      workflow: 'sdk-publish.yml',
      waitMs: 0,
      listRuns: async () => [{
        headBranch: 'tracemind-release-2026.5.20-1',
        status: 'completed',
        conclusion: 'failure',
      }],
      sleepFn: async () => {},
    }),
    /ended with failure/,
  );
});

test('checkGithubWorkflow rejects timed out release tag workflow runs', async () => {
  await assert.rejects(
    () => checkGithubWorkflow({
      cwd: process.cwd(),
      tag: 'tracemind-release-2026.5.20-1',
      workflow: 'sdk-publish.yml',
      waitMs: 0,
      listRuns: async () => [{
        headBranch: 'tracemind-release-2026.5.20-1',
        status: 'in_progress',
        conclusion: null,
      }],
      sleepFn: async () => {},
    }),
    /is in_progress/,
  );
});

test('checkSdkRegistryPublication rejects deploys with missing registry metadata', async () => {
  const repo = tempDir('sdk-registry-missing');
  writePackage(repo);
  writeManifest(repo, {
    manifestVersion: 1,
    sourceRef: 'tracemind-release-2026.5.20-1',
    sdks: [
      {
        sdkName: 'server_node',
        sourceRef: 'tracemind-release-2026.5.20-1',
        distributionMode: 'registry',
        publishStatus: 'published',
      },
    ],
  });

  await assert.rejects(
    () => checkSdkRegistryPublication({
      cwd: repo,
      version: '2026.5.20-1',
      checkWorkflow: false,
      fetchText: async () => '{}',
    }),
    /server_node missing registry package metadata/,
  );
});

test('sdk publish workflow cannot run the Meteor deploy command', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/sdk-publish.yml'), 'utf8');
  const jreleaser = fs.readFileSync(path.join(__dirname, '../sdk/android/jreleaser.yml'), 'utf8');
  assert.ok(workflow.includes('SDK Publish'));
  assert.ok(!workflow.includes('npm run deploy'));
  assert.ok(!workflow.includes('meteor deploy'));
  assert.ok(!workflow.includes('npm install -g npm@latest'));
  assert.ok(!workflow.includes("run: python - <<'PY'"));
  assert.ok(workflow.includes('arguments: deploy --config-file sdk/android/jreleaser.yml'));
  assert.ok(jreleaser.includes('groupId: io.github.wolf3c.tracemind'));
  assert.ok(jreleaser.includes('namespace: io.github.wolf3c'));
  assert.ok(jreleaser.includes('signing:'));
  assert.ok(!jreleaser.includes('{{ Env.'));
});

test('deploy skill waits for registry publication before its only deploy step', () => {
  const skill = fs.readFileSync(path.join(__dirname, '../.codex/skills/deploy/SKILL.md'), 'utf8');
  const gateIndex = skill.indexOf('npm run check:sdk-registry-publication -- ${version}');
  const deployIndex = skill.lastIndexOf('npm run deploy');
  assert.ok(gateIndex > 0);
  assert.ok(deployIndex > gateIndex);
  assert.equal(skill.match(/^\s+- Prefer the repository script: `npm run deploy`\./gm).length, 1);
});
