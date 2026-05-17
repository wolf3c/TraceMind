#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const RELEASE_TAG_PREFIX = 'tracemind-release-';
const VERSION_PATTERN = /^\d{4}\.\d{1,2}\.\d{1,2}-\d+$/;

function normalizedVersion(version) {
  return String(version || '').trim();
}

function releaseTagForVersion(version) {
  const value = normalizedVersion(version);
  if (!VERSION_PATTERN.test(value)) {
    throw new Error(`Invalid TraceMind release version: ${value || '(empty)'}`);
  }
  return `${RELEASE_TAG_PREFIX}${value}`;
}

function packageVersion(cwd = process.cwd()) {
  const packagePath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error('Missing package.json. Run release scripts from the TraceMind repository root.');
  }
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
}

function assertPackageVersion(version, cwd = process.cwd()) {
  const expectedVersion = normalizedVersion(version);
  const actualVersion = packageVersion(cwd);
  if (actualVersion !== expectedVersion) {
    throw new Error(`Release version ${expectedVersion || '(empty)'} does not match package.json version ${actualVersion || '(missing)'}. Update package.json or pass the correct version before deploying.`);
  }
}

function updateManifestSourceRef(manifestPath, version, { generatedAt = new Date().toISOString() } = {}) {
  const sourceRef = releaseTagForVersion(version);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const next = {
    ...manifest,
    generatedAt,
    sourceRef,
    sdks: (manifest.sdks || []).map((sdk) => ({
      ...sdk,
      sourceRef,
    })),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function prepareSdkReleaseRef(version, { cwd = process.cwd() } = {}) {
  assertPackageVersion(version, cwd);
  const sourceRef = releaseTagForVersion(version);
  process.env.TRACEMIND_SDK_SOURCE_REF = sourceRef;

  const {
    MANIFEST_PATH,
    buildManifest,
    readManifest,
    writeHashConstants,
    writeManifest,
  } = require('./check-sdk-release-manifest');

  const existingManifest = readManifest();
  if (!existingManifest) {
    throw new Error('Missing sdk/release_manifest.json. Run npm run update:sdk-manifest first.');
  }
  const manifest = buildManifest({
    ...existingManifest,
    sourceRef,
  });
  writeHashConstants(manifest);
  const finalManifest = buildManifest({
    ...existingManifest,
    sourceRef,
    sdks: manifest.sdks,
  });
  const generatedAt = new Date().toISOString();
  writeManifest({
    ...finalManifest,
    generatedAt,
  });
  return {
    manifestPath: path.relative(process.cwd(), MANIFEST_PATH),
    sourceRef,
    generatedAt,
  };
}

if (require.main === module) {
  try {
    const version = process.argv[2];
    const result = prepareSdkReleaseRef(version);
    console.log(`Prepared ${result.manifestPath} with sourceRef ${result.sourceRef}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  RELEASE_TAG_PREFIX,
  assertPackageVersion,
  packageVersion,
  releaseTagForVersion,
  prepareSdkReleaseRef,
  updateManifestSourceRef,
};
