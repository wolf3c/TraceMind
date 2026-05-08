const FORBIDDEN_FIELD_PATTERN = /(rawprompt|rawusercontent|token|secret|password|email|phone|input)/i;

function sanitizeFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key, value]) => {
        if (FORBIDDEN_FIELD_PATTERN.test(key)) return false;
        if (typeof value === 'string' && /^https?:\/\/\S+\?\S+/.test(value)) return false;
        return true;
      }),
  );
}

function resolveNativeModule(explicitNativeModule) {
  if (explicitNativeModule) return explicitNativeModule;
  try {
    const { NativeModules } = require('react-native');
    return NativeModules.TraceMindModule;
  } catch (error) {
    return null;
  }
}

function createTraceMindClient({ nativeModule, platform } = {}) {
  const resolvedNativeModule = resolveNativeModule(nativeModule);

  function assertNativeModule() {
    if (!resolvedNativeModule) {
      throw new Error('TraceMind native module is unavailable. Make sure the native iOS and Android SDKs are linked.');
    }
  }

  return {
    start({ projectKey, endpoint } = {}) {
      if (!projectKey) {
        throw new Error('TraceMind.start requires projectKey.');
      }
      assertNativeModule();
      resolvedNativeModule.start({
        projectKey,
        endpoint,
        deviceInfo: { framework: 'react_native' },
      });
    },

    capture(type, payload = {}) {
      assertNativeModule();
      resolvedNativeModule.capture(type, {
        ...payload,
        properties: sanitizeFields(payload.properties),
        context: sanitizeFields(payload.context),
        deviceInfo: {
          ...(payload.deviceInfo || {}),
          framework: 'react_native',
        },
      });
    },

    platform,
  };
}

const TraceMind = createTraceMindClient();

module.exports = {
  TraceMind,
  createTraceMindClient,
  sanitizeFields,
};
