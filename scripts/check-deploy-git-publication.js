#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { assertPackageVersion, releaseTagForVersion } = require('./prepare-sdk-release-ref');

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function remoteHead(cwd, remote = 'origin', branch = 'main') {
  const output = git(cwd, ['ls-remote', '--heads', remote, branch]);
  const [hash] = output.split(/\s+/);
  return hash || '';
}

function remoteTagTarget(cwd, tag, remote = 'origin') {
  const output = git(cwd, ['ls-remote', '--tags', remote, tag]);
  const lines = output.split('\n').filter(Boolean);
  const peeled = lines.find((line) => line.endsWith(`refs/tags/${tag}^{}`));
  const direct = lines.find((line) => line.endsWith(`refs/tags/${tag}`));
  const selected = peeled || direct || '';
  return selected.split(/\s+/)[0] || '';
}

function checkReleaseManifestSourceRef(cwd, expectedSourceRef) {
  const manifestPath = path.join(cwd, 'sdk/release_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Missing sdk/release_manifest.json. Run npm run prepare:sdk-release-ref before deploying.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const refs = [
    ['root', manifest.sourceRef],
    ...(manifest.sdks || []).map((sdk) => [sdk.sdkName || 'unknown_sdk', sdk.sourceRef]),
  ];
  const mismatched = refs.filter(([, sourceRef]) => sourceRef !== expectedSourceRef);
  if (mismatched.length) {
    const labels = mismatched.map(([label]) => label).join(', ');
    throw new Error(`sdk/release_manifest.json sourceRef must be ${expectedSourceRef} before deploy. Mismatched entries: ${labels}. Run npm run prepare:sdk-release-ref -- ${expectedSourceRef.replace(/^tracemind-release-/, '')}.`);
  }
}

function checkDeployGitPublication({ cwd = process.cwd(), version, remote = 'origin' } = {}) {
  const tag = releaseTagForVersion(version);
  assertPackageVersion(version, cwd);

  const branch = git(cwd, ['branch', '--show-current']);
  if (branch !== 'main') {
    throw new Error(`Deploy publication check must run from main, currently on ${branch || '(detached)'}.`);
  }

  const status = git(cwd, ['status', '--porcelain']);
  if (status) {
    throw new Error('Deploy publication check failed: working tree is not clean.');
  }

  checkReleaseManifestSourceRef(cwd, tag);

  const head = git(cwd, ['rev-parse', 'HEAD']);
  const originMain = remoteHead(cwd, remote, 'main');
  if (!originMain) {
    throw new Error(`Remote ${remote}/main is missing.`);
  }
  if (originMain !== head) {
    throw new Error(`Remote ${remote}/main does not match HEAD. Push main before deploying.`);
  }

  const remoteTag = remoteTagTarget(cwd, tag, remote);
  if (!remoteTag) {
    throw new Error(`Remote release tag ${tag} is missing. Push the tag before deploying.`);
  }
  if (remoteTag !== head) {
    throw new Error(`Remote release tag ${tag} does not point to HEAD. Refuse to deploy.`);
  }

  return {
    ok: true,
    branch,
    head,
    originMain,
    tag,
    remoteTag,
  };
}

if (require.main === module) {
  try {
    const version = process.argv[2];
    const result = checkDeployGitPublication({ version });
    console.log(`Git publication is ready for ${result.tag} at ${result.head}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  checkDeployGitPublication,
  checkReleaseManifestSourceRef,
  remoteHead,
  remoteTagTarget,
};
