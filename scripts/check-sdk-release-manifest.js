#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'sdk/release_manifest.json');
const SOURCE_REPO = 'https://github.com/wolf3c/TraceMind.git';
const DEFAULT_SOURCE_REF = process.env.TRACEMIND_SDK_SOURCE_REF || 'main';
const HASH_PLACEHOLDER = '__TRACEMIND_SDK_CONTENT_HASH__';
const RUNTIME_CANDIDATE_EXTENSIONS = new Set(['.js', '.json', '.py', '.swift', '.kt', '.kts', '.java', '.m', '.mm', '.h', '.xml']);
const IGNORED_RUNTIME_DIRS = new Set([
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

const SDK_CONFIGS = [
  {
    sdkName: 'swift',
    sdkSourcePath: 'sdk/ios',
    platforms: ['ios', 'macos'],
    versionFiles: [{ file: 'sdk/ios/Sources/TraceMind/TraceMind.swift', kind: 'swift' }],
    runtimeRoots: [
      { path: 'sdk/ios/Package.swift', type: 'file' },
      { path: 'sdk/ios/Sources', extensions: ['.swift'] },
    ],
    verificationCommands: ['swift test --package-path sdk/ios'],
  },
  {
    sdkName: 'android',
    sdkSourcePath: 'sdk/android',
    platforms: ['android'],
    versionFiles: [{ file: 'sdk/android/src/main/java/com/tracemind/TraceMindPayloadBuilder.kt', kind: 'kotlin' }],
    runtimeRoots: [
      { path: 'sdk/android/build.gradle.kts', type: 'file' },
      { path: 'sdk/android/settings.gradle.kts', type: 'file' },
      { path: 'sdk/android/src/main', extensions: ['.kt', '.java', '.xml'] },
    ],
    verificationCommands: ['npm run test:sdk:android'],
  },
  {
    sdkName: 'react_native',
    sdkSourcePath: 'sdk/react-native',
    platforms: ['react_native'],
    versionFiles: [
      { file: 'sdk/react-native/package.json', kind: 'package_json' },
      { file: 'sdk/react-native/index.js', kind: 'js' },
    ],
    runtimeRoots: [
      { path: 'sdk/react-native/package.json', type: 'file' },
      { path: 'sdk/react-native/index.js', type: 'file' },
      { path: 'sdk/react-native/ios', extensions: ['.swift', '.m', '.mm', '.h'] },
      { path: 'sdk/react-native/android/src/main', extensions: ['.kt', '.java', '.xml'] },
    ],
    verificationCommands: ['npm test --prefix sdk/react-native'],
  },
  {
    sdkName: 'mini_program',
    sdkSourcePath: 'sdk/mini-program',
    platforms: ['mini_program'],
    versionFiles: [
      { file: 'sdk/mini-program/package.json', kind: 'package_json' },
      { file: 'sdk/mini-program/index.js', kind: 'js' },
    ],
    runtimeRoots: [{ path: 'sdk/mini-program', extensions: ['.js', '.json'] }],
    verificationCommands: ['npm test --prefix sdk/mini-program'],
  },
  {
    sdkName: 'browser_extension',
    sdkSourcePath: 'sdk/browser-extension',
    platforms: ['browser_extension'],
    versionFiles: [
      { file: 'sdk/browser-extension/package.json', kind: 'package_json' },
      { file: 'sdk/browser-extension/index.js', kind: 'js' },
    ],
    runtimeRoots: [{ path: 'sdk/browser-extension', extensions: ['.js', '.json'] }],
    verificationCommands: ['npm test --prefix sdk/browser-extension'],
  },
  {
    sdkName: 'mcp_node',
    sdkSourcePath: 'sdk/mcp-node',
    platforms: ['mcp_node', 'agent_skill'],
    versionFiles: [
      { file: 'sdk/mcp-node/package.json', kind: 'package_json' },
      { file: 'sdk/mcp-node/index.js', kind: 'js' },
    ],
    runtimeRoots: [{ path: 'sdk/mcp-node', extensions: ['.js', '.json'] }],
    verificationCommands: ['npm test --prefix sdk/mcp-node'],
  },
  {
    sdkName: 'mcp_python',
    sdkSourcePath: 'sdk/mcp-python',
    platforms: ['mcp_python'],
    versionFiles: [{ file: 'sdk/mcp-python/tracemind_mcp/__init__.py', kind: 'python' }],
    runtimeRoots: [{ path: 'sdk/mcp-python/tracemind_mcp', extensions: ['.py'] }],
    verificationCommands: ['PYTHONPATH=sdk/mcp-python python3 -m unittest discover -s sdk/mcp-python/tests'],
  },
  {
    sdkName: 'server_node',
    sdkSourcePath: 'sdk/server-node',
    platforms: ['server_node'],
    versionFiles: [
      { file: 'sdk/server-node/package.json', kind: 'package_json' },
      { file: 'sdk/server-node/index.js', kind: 'js' },
    ],
    runtimeRoots: [{ path: 'sdk/server-node', extensions: ['.js', '.json'] }],
    verificationCommands: ['npm test --prefix sdk/server-node'],
  },
  {
    sdkName: 'server_python',
    sdkSourcePath: 'sdk/server-python',
    platforms: ['server_python'],
    versionFiles: [{ file: 'sdk/server-python/tracemind_server/__init__.py', kind: 'python' }],
    runtimeRoots: [{ path: 'sdk/server-python/tracemind_server', extensions: ['.py'] }],
    verificationCommands: ['PYTHONPATH=sdk/server-python python3 -m unittest discover -s sdk/server-python/tests'],
  },
];

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function writeFile(relativePath, contents) {
  fs.writeFileSync(path.join(ROOT, relativePath), contents);
}

function shouldIgnoreRuntimePath(relativePath) {
  return relativePath.split(path.sep).some((part) => IGNORED_RUNTIME_DIRS.has(part.toLowerCase()));
}

function walkFiles(relativePath) {
  if (shouldIgnoreRuntimePath(relativePath)) return [];
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing SDK runtime path: ${relativePath}`);
  }
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [relativePath];
  if (!stat.isDirectory()) return [];

  return fs.readdirSync(absolutePath)
    .flatMap((entry) => walkFiles(path.join(relativePath, entry)));
}

function matchesRuntimeRoot(file, runtimeRoot) {
  if (runtimeRoot.type === 'file') return file === runtimeRoot.path;
  return (runtimeRoot.extensions || []).includes(path.extname(file));
}

function runtimeCandidates(config) {
  return walkFiles(config.sdkSourcePath)
    .filter((file) => RUNTIME_CANDIDATE_EXTENSIONS.has(path.extname(file)))
    .sort();
}

function discoverRuntimeFiles(config) {
  const files = new Set();
  (config.runtimeRoots || []).forEach((runtimeRoot) => {
    walkFiles(runtimeRoot.path)
      .filter((file) => matchesRuntimeRoot(file, runtimeRoot))
      .forEach((file) => files.add(file));
  });

  const sortedFiles = [...files].sort();
  const discovered = new Set(sortedFiles);
  const unclassified = runtimeCandidates(config)
    .filter((file) => !discovered.has(file));
  if (unclassified.length) {
    throw new Error(`${config.sdkName} has unclassified runtime-like files: ${unclassified.join(', ')}. Add them to runtimeRoots or exclude them explicitly.`);
  }
  if (!sortedFiles.length) {
    throw new Error(`${config.sdkName} has no discovered runtime files.`);
  }
  return sortedFiles;
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function sourceRef(existingManifest) {
  return process.env.TRACEMIND_SDK_SOURCE_REF
    || existingManifest?.sourceRef
    || DEFAULT_SOURCE_REF;
}

function canonicalRuntimeText(text) {
  return text
    .replace(/(SDK_CONTENT_HASH\s*=\s*['"])([^'"]*)(['"])/g, `$1${HASH_PLACEHOLDER}$3`)
    .replace(/(contentHash\s*=\s*")([^"]*)(")/g, `$1${HASH_PLACEHOLDER}$3`)
    .replace(/(CONTENT_HASH\s*=\s*")([^"]*)(")/g, `$1${HASH_PLACEHOLDER}$3`);
}

function contentHash(files) {
  const hash = crypto.createHash('sha256');
  files.slice().sort().forEach((file) => {
    hash.update(file);
    hash.update('\0');
    hash.update(canonicalRuntimeText(readFile(file)));
    hash.update('\0');
  });
  return `sha256:${hash.digest('hex')}`;
}

function extractVersion(file, kind) {
  const text = readFile(file);
  if (kind === 'package_json') return JSON.parse(text).version;
  const patterns = {
    js: /SDK_VERSION\s*=\s*['"]([^'"]+)['"]/,
    python: /SDK_VERSION\s*=\s*["']([^"']+)["']/,
    swift: /static\s+let\s+version\s*=\s*"([^"]+)"/,
    kotlin: /const\s+val\s+VERSION\s*=\s*"([^"]+)"/,
  };
  const match = text.match(patterns[kind]);
  return match?.[1] || '';
}

function extractHashConstant(file, kind) {
  const text = readFile(file);
  const patterns = {
    js: /SDK_CONTENT_HASH\s*=\s*['"]([^'"]+)['"]/,
    python: /SDK_CONTENT_HASH\s*=\s*["']([^"']+)["']/,
    swift: /static\s+let\s+contentHash\s*=\s*"([^"]+)"/,
    kotlin: /const\s+val\s+CONTENT_HASH\s*=\s*"([^"]+)"/,
  };
  if (!patterns[kind]) return null;
  const match = text.match(patterns[kind]);
  return match?.[1] || '';
}

function replaceHashConstant(file, kind, hash) {
  const text = readFile(file);
  const patterns = {
    js: /(SDK_CONTENT_HASH\s*=\s*['"])([^'"]*)(['"])/,
    python: /(SDK_CONTENT_HASH\s*=\s*["'])([^"']*)(["'])/,
    swift: /(static\s+let\s+contentHash\s*=\s*")([^"]*)(")/,
    kotlin: /(const\s+val\s+CONTENT_HASH\s*=\s*")([^"]*)(")/,
  };
  const pattern = patterns[kind];
  if (!pattern) return;
  if (!pattern.test(text)) {
    throw new Error(`Missing SDK content hash constant in ${file}`);
  }
  writeFile(file, text.replace(pattern, `$1${hash}$3`));
}

function versionForSdk(config) {
  const versions = config.versionFiles.map((versionFile) => ({
    file: versionFile.file,
    version: extractVersion(versionFile.file, versionFile.kind),
  }));
  const uniqueVersions = [...new Set(versions.map((entry) => entry.version).filter(Boolean))];
  if (uniqueVersions.length !== 1) {
    const detail = versions.map((entry) => `${entry.file}: ${entry.version || 'missing'}`).join(', ');
    throw new Error(`${config.sdkName} has mismatched SDK versions: ${detail}`);
  }
  return uniqueVersions[0];
}

function defaultUpgradePolicy(sdkName) {
  return {
    level: 'recommended',
    reason: 'TraceMind uses SDK content hash as the source of truth so coding agents can detect updates even if a human forgets a version bump.',
    agentPrompt: `Ask your coding agent to run tracemind.project_health, read .tracemind-sdk.json, call tracemind.capture_setup({ platform }), update the vendored ${sdkName} SDK, run verificationCommands, and report the result.`,
  };
}

function buildManifest(existingManifest = null) {
  const ref = sourceRef(existingManifest);
  const existingByName = new Map((existingManifest?.sdks || []).map((sdk) => [sdk.sdkName, sdk]));
  const sdks = SDK_CONFIGS.map((config) => {
    const hash = contentHash(discoverRuntimeFiles(config));
    const existing = existingByName.get(config.sdkName) || {};
    return {
      sdkName: config.sdkName,
      displayVersion: versionForSdk(config),
      contentHash: hash,
      sourceRepo: SOURCE_REPO,
      sourceRef: ref,
      sdkSourcePath: config.sdkSourcePath,
      platforms: config.platforms,
      minimumSupportedHash: existing.minimumSupportedHash || hash,
      upgradePolicy: existing.upgradePolicy || defaultUpgradePolicy(config.sdkName),
      verificationCommands: config.verificationCommands,
    };
  });

  return {
    manifestVersion: 1,
    generatedAt: existingManifest?.generatedAt || new Date().toISOString(),
    sourceRepo: SOURCE_REPO,
    sourceRef: ref,
    sdks,
  };
}

function validateHashConstants(manifest) {
  const hashByName = new Map(manifest.sdks.map((sdk) => [sdk.sdkName, sdk.contentHash]));
  SDK_CONFIGS.forEach((config) => {
    const expectedHash = hashByName.get(config.sdkName);
    config.versionFiles.forEach((versionFile) => {
      const actualHash = extractHashConstant(versionFile.file, versionFile.kind);
      if (actualHash === null) return;
      if (actualHash !== expectedHash) {
        throw new Error(`${versionFile.file} has SDK content hash ${actualHash || 'missing'}, expected ${expectedHash}`);
      }
    });
  });
}

function normalizeManifestForCompare(manifest) {
  return {
    ...manifest,
    generatedAt: 'ignored',
  };
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeHashConstants(manifest) {
  const hashByName = new Map(manifest.sdks.map((sdk) => [sdk.sdkName, sdk.contentHash]));
  SDK_CONFIGS.forEach((config) => {
    config.versionFiles.forEach((versionFile) => {
      replaceHashConstant(versionFile.file, versionFile.kind, hashByName.get(config.sdkName));
    });
  });
}

function check({ write = false } = {}) {
  const existingManifest = readManifest();
  let expected = buildManifest(existingManifest);

  if (write) {
    writeHashConstants(expected);
    expected = buildManifest({
      ...existingManifest,
      sourceRef: expected.sourceRef,
      sdks: expected.sdks,
    });
    writeManifest({
      ...expected,
      generatedAt: new Date().toISOString(),
    });
    console.log(`Updated ${path.relative(ROOT, MANIFEST_PATH)}`);
    return;
  }

  if (!existingManifest) {
    throw new Error('Missing sdk/release_manifest.json. Run npm run update:sdk-manifest.');
  }

  validateHashConstants(existingManifest);
  const actualComparable = normalizeManifestForCompare(existingManifest);
  const expectedComparable = normalizeManifestForCompare(expected);
  if (JSON.stringify(actualComparable) !== JSON.stringify(expectedComparable)) {
    throw new Error('sdk/release_manifest.json is stale. Run npm run update:sdk-manifest.');
  }
}

if (require.main === module) {
  try {
    const args = new Set(process.argv.slice(2));
    check({ write: args.has('--write') || args.has('write') });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  SDK_CONFIGS,
  buildManifest,
  check,
  contentHash,
  discoverRuntimeFiles,
};
