<script>
  import { t } from "./i18n/i18n";

  let {
    email = $bindable(),
    code = $bindable(),
    loading,
    status = "",
    requestCode,
    verifyCode,
    dismissStatus,
  } = $props();
</script>

<div class="auth-panel card-panel">
  <label class="field-label">
    <span>{$t("Email")}</span>
    <input id="email" name="email" bind:value={email} type="email" placeholder={$t("you@example.com")} autocomplete="email" />
  </label>
  <div class="auth-actions">
    <button type="button" onclick={requestCode} disabled={loading}>{$t("Send code")}</button>
  </div>
  <label class="field-label">
    <span>{$t("Verification code")}</span>
    <input id="login-code" name="code" bind:value={code} inputmode="numeric" placeholder={$t("123456")} />
  </label>
  {#if status}
    <div class="status-alert auth-status-alert" role="status" aria-live="polite">
      <span>{status}</span>
      <button class="status-dismiss" type="button" onclick={dismissStatus} aria-label={$t("Dismiss status message")}>
        &times;
      </button>
    </div>
  {/if}
  <button type="button" onclick={verifyCode} disabled={loading}>{$t("Log in")}</button>
</div>
