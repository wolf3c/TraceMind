export function isPwaStandalone(windowRef = globalThis) {
  return Boolean(
    windowRef?.matchMedia?.("(display-mode: standalone)")?.matches
    || windowRef?.navigator?.standalone === true,
  );
}

export function isIosInstallGuidanceTarget(navigatorRef = globalThis.navigator) {
  const userAgent = String(navigatorRef?.userAgent || "");
  const platform = String(navigatorRef?.platform || "");
  const touchPoints = Number(navigatorRef?.maxTouchPoints || 0);

  return /iPad|iPhone|iPod/.test(platform)
    || (/Mac/.test(platform) && touchPoints > 1 && /Safari|AppleWebKit/.test(userAgent));
}

export function pwaInstallEntryMode({
  isInstalled = false,
  hasInstallPrompt = false,
  isIosGuidanceTarget = false,
} = {}) {
  if (isInstalled) return "hidden";
  if (hasInstallPrompt) return "browser";
  if (isIosGuidanceTarget) return "ios";
  return "hidden";
}

export function registerTraceMindPwa({
  windowRef = globalThis,
  documentRef = globalThis.document,
  navigatorRef = globalThis.navigator,
} = {}) {
  if (!windowRef?.isSecureContext || !navigatorRef?.serviceWorker) return Promise.resolve(null);

  const register = () => navigatorRef.serviceWorker
    .register("/service-worker.js", { scope: "/" })
    .catch(() => null);

  if (documentRef?.readyState === "complete") return register();

  windowRef.addEventListener?.("load", register, { once: true });
  return Promise.resolve(null);
}
