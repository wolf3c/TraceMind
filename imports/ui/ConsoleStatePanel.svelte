<script>
  import { t } from "./i18n/i18n";

  let {
    state,
    dashboardLoadError,
    dashboardLoading,
    retryDashboard,
    logout,
  } = $props();
</script>

{#if state === "restoring-session"}
  <div class="console-state-panel card-panel" role="status" aria-live="polite">
    <span class="tm-badge tm-badge-signal">{$t("Developer console")}</span>
    <strong>{$t("Checking your session...")}</strong>
  </div>
{:else if state === "loading-dashboard"}
  <div class="console-state-panel card-panel" role="status" aria-live="polite">
    <span class="tm-badge tm-badge-signal">{$t("Developer console")}</span>
    <strong>{$t("Loading your console...")}</strong>
  </div>
{:else if state === "dashboard-error"}
  <div class="console-state-panel card-panel" role="alert">
    <span class="tm-badge tm-badge-amber">{$t("Developer console")}</span>
    <strong>{$t("Could not load your console.")}</strong>
    <p>{dashboardLoadError}</p>
    <div class="console-state-actions">
      <button type="button" onclick={retryDashboard} disabled={dashboardLoading}>
        {dashboardLoading ? $t("Loading your console...") : $t("Retry")}
      </button>
      <button class="ghost" type="button" onclick={logout}>{$t("Log out")}</button>
    </div>
  </div>
{/if}
