export const WEB_CAPTURE_UPDATE_TARGET = "web-capture-update-prompt";

function fallbackTranslate(key, vars = {}) {
  let text = key;
  Object.keys(vars).forEach((name) => {
    text = text.replace(new RegExp(`{{${name}}}`, "g"), vars[name]);
  });
  return text;
}

function translateWith(translate, key, vars) {
  return typeof translate === "function" ? translate(key, vars) : fallbackTranslate(key, vars);
}

function sourceNameForFinding(finding, translate) {
  return finding?.sourceLabel || finding?.sourceKey || translateWith(translate, "this source");
}

function buildWebCaptureScriptUpdateNotice({
  findings = [],
  copiedTarget = "",
  webCaptureUpdatePrompt = "",
  copyWebCaptureUpdatePrompt = () => {},
  translate,
} = {}) {
  if (!findings.length) return null;

  const primaryFinding = findings[0] || {};
  const sourceName = sourceNameForFinding(primaryFinding, translate);
  const remainingSourceCount = Math.max(0, findings.length - 1);
  const updatePromptCopied = copiedTarget === WEB_CAPTURE_UPDATE_TARGET;
  const meta = [
    { label: translateWith(translate, "Source"), value: sourceName },
  ];

  if (primaryFinding.observedReleaseId) {
    meta.push({
      label: translateWith(translate, "Observed release"),
      value: primaryFinding.observedReleaseId,
    });
  }

  if (primaryFinding.latestReleaseId) {
    meta.push({
      label: translateWith(translate, "Latest release"),
      value: primaryFinding.latestReleaseId,
    });
  }

  if (remainingSourceCount) {
    meta.push({
      label: translateWith(translate, "Also affected"),
      value: translateWith(translate, "{{count}} more sources", { count: remainingSourceCount }),
    });
  }

  return {
    id: "web-capture-script-update",
    ariaLabel: translateWith(translate, "Web Auto Capture update action"),
    badge: translateWith(translate, "Setup action"),
    title: translateWith(translate, "Web Auto Capture script needs update"),
    description: translateWith(
      translate,
      "Detected {{source}} is still running an old script. Copy the update instruction, then paste it into your coding agent to run the update and verification.",
      { source: sourceName },
    ),
    resolution: translateWith(
      translate,
      "After the update is deployed, trigger one real behavior and refresh project health. This notice disappears when TraceMind no longer detects old script reports.",
    ),
    metaLabel: translateWith(translate, "Update evidence"),
    meta,
    action: {
      label: updatePromptCopied
        ? translateWith(translate, "Copied update instruction")
        : translateWith(translate, "Copy update instruction"),
      copied: updatePromptCopied,
      disabled: !webCaptureUpdatePrompt,
      onClick: copyWebCaptureUpdatePrompt,
      state: updatePromptCopied
        ? translateWith(translate, "Copied. Paste it into your coding agent to run the update.")
        : "",
    },
  };
}

export function buildProjectActionNotices({
  captureScriptFindings = [],
  copiedTarget = "",
  webCaptureUpdatePrompt = "",
  copyWebCaptureUpdatePrompt = () => {},
  translate,
} = {}) {
  return [
    buildWebCaptureScriptUpdateNotice({
      findings: captureScriptFindings,
      copiedTarget,
      webCaptureUpdatePrompt,
      copyWebCaptureUpdatePrompt,
      translate,
    }),
  ].filter(Boolean);
}
