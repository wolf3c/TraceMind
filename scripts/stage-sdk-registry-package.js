#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'sdk/release_manifest.json');
const IGNORED_DIRS = new Set([
  '.build',
  '.gradle',
  '.swiftpm-cache',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'test',
  'tests',
]);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function copyFiltered(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    if (IGNORED_DIRS.has(path.basename(source))) return;
    fs.mkdirSync(target, { recursive: true });
    fs.readdirSync(source).forEach((entry) => {
      copyFiltered(path.join(source, entry), path.join(target, entry));
    });
    return;
  }
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function replaceTomlVersion(file, version) {
  const text = fs.readFileSync(file, 'utf8');
  if (!/^version = /m.test(text)) {
    throw new Error(`Missing project version in ${path.relative(ROOT, file)}`);
  }
  fs.writeFileSync(file, text.replace(/^version = ".*"$/m, `version = "${version}"`));
}

function stageSdkRegistryPackage({ sdkName, outDir }) {
  const manifest = readJson(MANIFEST_PATH);
  const sdk = (manifest.sdks || []).find((entry) => entry.sdkName === sdkName);
  if (!sdk) throw new Error(`Unknown SDK: ${sdkName}`);
  if (sdk.distributionMode !== 'registry' || !sdk.registry) {
    throw new Error(`${sdkName} is not configured for registry publishing.`);
  }

  const source = path.join(ROOT, sdk.sdkSourcePath);
  const target = path.resolve(ROOT, outDir);
  fs.rmSync(target, { recursive: true, force: true });
  copyFiltered(source, target);

  if (sdk.registry.type === 'npm') {
    const packagePath = path.join(target, 'package.json');
    const packageJson = readJson(packagePath);
    delete packageJson.private;
    packageJson.version = sdk.registry.packageVersion;
    packageJson.publishConfig = {
      ...(packageJson.publishConfig || {}),
      access: 'public',
    };
    writeJson(packagePath, packageJson);
  } else if (sdk.registry.type === 'pypi') {
    replaceTomlVersion(path.join(target, 'pyproject.toml'), sdk.registry.packageVersion);
  }

  return {
    sdkName,
    registry: sdk.registry,
    outDir: path.relative(ROOT, target),
  };
}

if (require.main === module) {
  try {
    const sdkName = argValue('--sdk');
    const outDir = argValue('--out') || `.sdk-publish/${sdkName}`;
    const result = stageSdkRegistryPackage({ sdkName, outDir });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  stageSdkRegistryPackage,
};
