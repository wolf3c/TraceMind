const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const {
  RELEASE_TAG_PREFIX,
  assertPackageVersion,
  releaseTagForVersion,
  updateManifestSourceRef,
} = require('./prepare-sdk-release-ref');
const {
  checkDeployGitPublication,
} = require('./check-deploy-git-publication');

function runGit(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tracemind-${name}-`));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeReleaseManifest(repo, version, sourceRef = releaseTagForVersion(version)) {
  const sdkDir = path.join(repo, 'sdk');
  fs.mkdirSync(sdkDir, { recursive: true });
  writeJson(path.join(sdkDir, 'release_manifest.json'), {
    manifestVersion: 1,
    sourceRef,
    sdks: [
      { sdkName: 'swift', sourceRef },
      { sdkName: 'android', sourceRef },
    ],
  });
}

function createRepoWithRemote(version = '2026.5.18-1') {
  const root = tempDir('deploy-gate');
  const remote = path.join(root, 'origin.git');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  runGit(root, ['init', '--bare', remote]);
  runGit(repo, ['init', '-b', 'main']);
  runGit(repo, ['config', 'user.email', 'test@example.com']);
  runGit(repo, ['config', 'user.name', 'TraceMind Test']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'TraceMind\n');
  writeJson(path.join(repo, 'package.json'), { name: 'TraceMind', version });
  writeReleaseManifest(repo, version);
  runGit(repo, ['add', 'README.md']);
  runGit(repo, ['add', 'package.json']);
  runGit(repo, ['add', 'sdk/release_manifest.json']);
  runGit(repo, ['commit', '-m', 'Initial commit']);
  runGit(repo, ['remote', 'add', 'origin', remote]);
  runGit(repo, ['push', '-u', 'origin', 'main']);
  runGit(repo, ['tag', releaseTagForVersion(version)]);
  runGit(repo, ['push', 'origin', releaseTagForVersion(version)]);
  return { root, repo, remote, version };
}

test('releaseTagForVersion uses the immutable deploy tag format', () => {
  assert.equal(RELEASE_TAG_PREFIX, 'tracemind-release-');
  assert.equal(releaseTagForVersion('2026.5.18-1'), 'tracemind-release-2026.5.18-1');
  assert.throws(() => releaseTagForVersion('2026.05.18'), /Invalid TraceMind release version/);
});

test('assertPackageVersion rejects mismatched release versions', () => {
  const root = tempDir('package-version');
  writeJson(path.join(root, 'package.json'), { name: 'TraceMind', version: '2026.5.18-1' });

  assert.doesNotThrow(() => assertPackageVersion('2026.5.18-1', root));
  assert.throws(
    () => assertPackageVersion('2026.5.18-2', root),
    /does not match package\.json version 2026\.5\.18-1/,
  );
});

test('updateManifestSourceRef rewrites root and SDK source refs', () => {
  const manifest = {
    manifestVersion: 1,
    generatedAt: '2026-05-17T00:00:00.000Z',
    sourceRef: 'main',
    sdks: [
      { sdkName: 'swift', sourceRef: 'main' },
      { sdkName: 'android', sourceRef: 'main' },
    ],
  };
  const file = path.join(tempDir('manifest'), 'release_manifest.json');
  writeJson(file, manifest);

  const next = updateManifestSourceRef(file, '2026.5.18-1');

  assert.equal(next.sourceRef, 'tracemind-release-2026.5.18-1');
  assert.ok(next.generatedAt !== manifest.generatedAt);
  assert.deepEqual(next.sdks.map((sdk) => sdk.sourceRef), [
    'tracemind-release-2026.5.18-1',
    'tracemind-release-2026.5.18-1',
  ]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).sourceRef, 'tracemind-release-2026.5.18-1');
});

test('checkDeployGitPublication accepts a clean pushed main and matching release tag', () => {
  const { repo, version } = createRepoWithRemote();

  assert.deepEqual(checkDeployGitPublication({ cwd: repo, version }), {
    ok: true,
    branch: 'main',
    head: runGit(repo, ['rev-parse', 'HEAD']),
    originMain: runGit(repo, ['rev-parse', 'origin/main']),
    tag: releaseTagForVersion(version),
    remoteTag: runGit(repo, ['rev-parse', `refs/tags/${releaseTagForVersion(version)}`]),
  });
});

test('checkDeployGitPublication rejects unsafe deploy git states', () => {
  const missingTag = createRepoWithRemote('2026.5.18-1');
  writeJson(path.join(missingTag.repo, 'package.json'), { name: 'TraceMind', version: '2026.5.18-2' });
  writeReleaseManifest(missingTag.repo, '2026.5.18-2');
  runGit(missingTag.repo, ['add', 'package.json']);
  runGit(missingTag.repo, ['add', 'sdk/release_manifest.json']);
  runGit(missingTag.repo, ['commit', '-m', 'Prepare next release manifest']);
  runGit(missingTag.repo, ['push', 'origin', 'main']);
  assert.throws(
    () => checkDeployGitPublication({ cwd: missingTag.repo, version: '2026.5.18-2' }),
    /Remote release tag tracemind-release-2026\.5\.18-2 is missing/,
  );

  const dirty = createRepoWithRemote();
  fs.writeFileSync(path.join(dirty.repo, 'dirty.txt'), 'dirty\n');
  assert.throws(
    () => checkDeployGitPublication({ cwd: dirty.repo, version: dirty.version }),
    /working tree is not clean/,
  );

  const branch = createRepoWithRemote();
  runGit(branch.repo, ['checkout', '-b', 'feature']);
  assert.throws(
    () => checkDeployGitPublication({ cwd: branch.repo, version: branch.version }),
    /must run from main/,
  );

  const ahead = createRepoWithRemote();
  fs.writeFileSync(path.join(ahead.repo, 'next.txt'), 'next\n');
  runGit(ahead.repo, ['add', 'next.txt']);
  runGit(ahead.repo, ['commit', '-m', 'Local only']);
  assert.throws(
    () => checkDeployGitPublication({ cwd: ahead.repo, version: ahead.version }),
    /origin\/main does not match HEAD/,
  );

  const staleManifest = createRepoWithRemote();
  const staleTag = releaseTagForVersion(staleManifest.version);
  writeReleaseManifest(staleManifest.repo, staleManifest.version, 'main');
  runGit(staleManifest.repo, ['add', 'sdk/release_manifest.json']);
  runGit(staleManifest.repo, ['commit', '-m', 'Stale manifest source ref']);
  runGit(staleManifest.repo, ['tag', '-f', staleTag]);
  runGit(staleManifest.repo, ['push', 'origin', 'main']);
  runGit(staleManifest.repo, ['push', '--force', 'origin', staleTag]);
  assert.throws(
    () => checkDeployGitPublication({ cwd: staleManifest.repo, version: staleManifest.version }),
    /sdk\/release_manifest\.json sourceRef must be tracemind-release-2026\.5\.18-1/,
  );

  const wrongPackageVersion = createRepoWithRemote();
  writeJson(path.join(wrongPackageVersion.repo, 'package.json'), {
    name: 'TraceMind',
    version: '2026.5.18-2',
  });
  runGit(wrongPackageVersion.repo, ['add', 'package.json']);
  runGit(wrongPackageVersion.repo, ['commit', '-m', 'Wrong package version']);
  runGit(wrongPackageVersion.repo, ['push', 'origin', 'main']);
  runGit(wrongPackageVersion.repo, ['tag', '-f', releaseTagForVersion(wrongPackageVersion.version)]);
  runGit(wrongPackageVersion.repo, ['push', '--force', 'origin', releaseTagForVersion(wrongPackageVersion.version)]);
  assert.throws(
    () => checkDeployGitPublication({ cwd: wrongPackageVersion.repo, version: wrongPackageVersion.version }),
    /does not match package\.json version 2026\.5\.18-2/,
  );

  const oldTag = createRepoWithRemote();
  const tag = releaseTagForVersion(oldTag.version);
  runGit(oldTag.repo, ['tag', '-d', tag]);
  fs.writeFileSync(path.join(oldTag.repo, 'next.txt'), 'next\n');
  runGit(oldTag.repo, ['add', 'next.txt']);
  runGit(oldTag.repo, ['commit', '-m', 'Next commit']);
  runGit(oldTag.repo, ['push', 'origin', 'main']);
  runGit(oldTag.repo, ['fetch', 'origin', 'main', '--tags']);
  assert.throws(
    () => checkDeployGitPublication({ cwd: oldTag.repo, version: oldTag.version }),
    /does not point to HEAD/,
  );
});
