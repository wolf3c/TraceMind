import sdkReleaseManifest from '../../sdk/release_manifest.json';

export const SDK_RELEASE_MANIFEST = sdkReleaseManifest;

const SDK_BY_NAME = new Map((sdkReleaseManifest.sdks || []).map((sdk) => [sdk.sdkName, sdk]));
const SDK_BY_PLATFORM = new Map();

(sdkReleaseManifest.sdks || []).forEach((sdk) => {
  (sdk.platforms || []).forEach((platform) => {
    SDK_BY_PLATFORM.set(platform, sdk.sdkName);
  });
});

const SDK_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SDK_SOURCE_TYPES = new Set(['ios', 'macos', 'android', 'mini_program', 'browser_extension', 'mcp_server', 'agent_skill', 'server_app']);

function cleanString(value, max = 200, fallback = '') {
  return String(value || fallback).trim().slice(0, max);
}

function sourceDetailsForRecord(record = {}) {
  return record.sourceDetails && typeof record.sourceDetails === 'object' && !Array.isArray(record.sourceDetails)
    ? record.sourceDetails
    : {};
}

export function cleanSdkContentHash(value) {
  const hash = cleanString(value, 80).toLowerCase();
  return SDK_HASH_PATTERN.test(hash) ? hash : '';
}

export function latestSdkForSetup(sdkName) {
  return SDK_BY_NAME.get(sdkName) || null;
}

export function sdkNameForRecord(record = {}) {
  const sourceType = cleanString(record.sourceType || record.platform, 40).toLowerCase();
  const platform = cleanString(record.platform, 40).toLowerCase();
  const details = sourceDetailsForRecord(record);
  const language = cleanString(details.language, 40).toLowerCase();

  if (!SDK_SOURCE_TYPES.has(sourceType)) return '';
  if (sourceType === 'server_app' && language === 'javascript') return 'server_node';
  if (sourceType === 'server_app' && language === 'python') return 'server_python';
  if (sourceType === 'server_app') return '';
  if (sourceType === 'mcp_server' && language === 'python') return 'mcp_python';
  if (sourceType === 'mcp_server') return 'mcp_node';
  if (sourceType === 'agent_skill') return 'mcp_node';
  if (platform === 'react_native' || details.framework === 'react_native') return 'react_native';
  return SDK_BY_PLATFORM.get(sourceType) || SDK_BY_PLATFORM.get(platform) || '';
}

export function sdkUpgradeFindingsForRecords(records = []) {
  const findingsByKey = new Map();

  records.forEach((record) => {
    const sdkName = sdkNameForRecord(record);
    if (!sdkName) return;
    const latestSdk = latestSdkForSetup(sdkName);
    if (!latestSdk) return;

    const details = sourceDetailsForRecord(record);
    const sourceType = cleanString(record.sourceType || record.platform, 40, 'unknown');
    const sourceKey = cleanString(record.sourceKey || record.platform || 'unknown', 200);
    const sourceLabel = cleanString(record.sourceLabel || sourceKey, 200);
    const installedHash = cleanSdkContentHash(details.sdkContentHash);
    const installedVersion = cleanString(details.sdkVersion, 80);

    if (!installedHash) {
      const key = `sdk_version_unknown:${sdkName}:${sourceType}:${sourceKey}`;
      findingsByKey.set(key, {
        severity: 'low',
        code: 'sdk_version_unknown',
        sdkName,
        sourceType,
        sourceKey,
        sourceLabel,
        latestSdk,
        message: `TraceMind SDK version is unknown for ${sourceLabel}. Ask a coding agent to inspect .tracemind-sdk.json and refresh the vendored SDK if needed.`,
      });
      return;
    }

    if (installedHash !== latestSdk.contentHash) {
      const key = `sdk_update_available:${sdkName}:${sourceType}:${sourceKey}`;
      findingsByKey.set(key, {
        severity: 'medium',
        code: 'sdk_update_available',
        sdkName,
        sourceType,
        sourceKey,
        sourceLabel,
        installedVersion,
        installedContentHash: installedHash,
        latestSdk,
        message: `TraceMind found an SDK update for ${sourceLabel}. Copy the update prompt to your coding agent.`,
      });
    }
  });

  return [...findingsByKey.values()].sort((left, right) => (
    left.sdkName.localeCompare(right.sdkName)
    || left.sourceType.localeCompare(right.sourceType)
    || left.sourceKey.localeCompare(right.sourceKey)
  ));
}
