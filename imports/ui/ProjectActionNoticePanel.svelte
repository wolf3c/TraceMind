<script>
  import { t } from "./i18n/i18n";

  let {
    findings = [],
    copiedTarget,
    webCaptureUpdatePrompt,
    copyWebCaptureUpdatePrompt,
  } = $props();

  let primaryFinding = $derived(findings?.[0] || {});
  let sourceName = $derived(primaryFinding.sourceLabel || primaryFinding.sourceKey || $t("this source"));
  let remainingSourceCount = $derived(Math.max(0, (findings?.length || 0) - 1));
  let hasObservedRelease = $derived(Boolean(primaryFinding.observedReleaseId));
  let hasLatestRelease = $derived(Boolean(primaryFinding.latestReleaseId));
  let updatePromptCopied = $derived(copiedTarget === "web-capture-update-prompt");
</script>

<section class="project-action-notice-stack" aria-label={$t("Project action notices")}>
  <article class="project-action-notice" role="region" aria-label={$t("Web Auto Capture update action")}>
    <div class="project-action-notice-copy">
      <div class="project-action-heading">
        <span class="project-action-badge">{$t("Setup action")}</span>
        <h3>{$t("Web Auto Capture script needs update")}</h3>
      </div>
      <p>
        {$t("Detected {{source}} is still running an old script. Copy the update instruction, then paste it into your coding agent to run the update and verification.", { source: sourceName })}
      </p>
      <dl class="project-action-meta" aria-label={$t("Update evidence")}>
        <div>
          <dt>{$t("Source")}</dt>
          <dd>{sourceName}</dd>
        </div>
        {#if hasObservedRelease}
          <div>
            <dt>{$t("Observed release")}</dt>
            <dd>{primaryFinding.observedReleaseId}</dd>
          </div>
        {/if}
        {#if hasLatestRelease}
          <div>
            <dt>{$t("Latest release")}</dt>
            <dd>{primaryFinding.latestReleaseId}</dd>
          </div>
        {/if}
        {#if remainingSourceCount}
          <div>
            <dt>{$t("Also affected")}</dt>
            <dd>{$t("{{count}} more sources", { count: remainingSourceCount })}</dd>
          </div>
        {/if}
      </dl>
    </div>
    <div class="project-action-notice-actions">
      <button
        class:copied={updatePromptCopied}
        class="project-action-copy"
        type="button"
        onclick={copyWebCaptureUpdatePrompt}
        disabled={!webCaptureUpdatePrompt}
      >
        {updatePromptCopied ? $t("Copied update instruction") : $t("Copy update instruction")}
      </button>
      {#if updatePromptCopied}
        <span class="project-action-copy-state" role="status">{$t("Copied. Paste it into your coding agent to run the update.")}</span>
      {/if}
    </div>
  </article>
</section>
