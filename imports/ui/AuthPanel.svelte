<script>
  import { t } from "./i18n/i18n";

  let {
    email = $bindable(),
    code = $bindable(),
    loading,
    loadingProvider = "",
    loginServicesReady = true,
    oauthServices = { google: false, github: false },
    codeRequested = false,
    loginWithGoogle,
    loginWithGithub,
    status = "",
    requestCode,
    verifyCode,
    dismissStatus,
  } = $props();

  let showOAuthOptions = $derived(!loginServicesReady || oauthServices.google || oauthServices.github);
</script>

<div class="auth-panel card-panel">
  <div class="auth-header">
    <div class="auth-brand-lockup">
      <svg class="auth-brand-mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="15" fill="#FFFDF8"/>
        <path d="M17 43V21h7.5L32 35l7.5-14H47v22" fill="none" stroke="#0F2F2A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19 47c8-6 18-6 27 0" fill="none" stroke="#18A77A" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="47" cy="47" r="3.6" fill="#F2B84B"/>
      </svg>
      <span>TraceMind</span>
    </div>
    <h3>{$t("Sign in to TraceMind")}</h3>
    <p>{$t("Choose Google or GitHub, or use your email verification code.")}</p>
  </div>

  {#if showOAuthOptions}
    <div class="oauth-section">
      <div class="oauth-actions" aria-label={$t("OAuth login options")}>
        <button
          class="oauth-button"
          type="button"
          onclick={loginWithGoogle}
          disabled={loading || !loginServicesReady || !oauthServices.google}
          aria-busy={loadingProvider === "google"}
        >
          <span class="oauth-mark oauth-mark-google" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"/>
            </svg>
          </span>
          <span>{loadingProvider === "google" ? $t("Signing in with Google...") : $t("Continue with Google")}</span>
        </button>
        <button
          class="oauth-button"
          type="button"
          onclick={loginWithGithub}
          disabled={loading || !loginServicesReady || !oauthServices.github}
          aria-busy={loadingProvider === "github"}
        >
          <span class="oauth-mark oauth-mark-github" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.28-.01-1.22-.01-2.24-3.02.55-3.8-.74-4.04-1.41-.13-.34-.72-1.41-1.23-1.69-.42-.23-1.02-.78-.01-.8.94-.01 1.62.87 1.84 1.23 1.08 1.82 2.81 1.3 3.5.99.1-.78.42-1.3.76-1.6-2.67-.3-5.46-1.34-5.46-5.93 0-1.3.47-2.38 1.23-3.22-.12-.3-.54-1.53.12-3.18 0 0 1-.32 3.3 1.23.96-.27 1.98-.41 3-.41s2.04.14 3 .41c2.3-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.23 1.92 1.23 3.22 0 4.61-2.8 5.62-5.47 5.93.43.37.81 1.09.81 2.21 0 1.6-.01 2.9-.01 3.3 0 .32.22.69.82.58A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </span>
          <span>{loadingProvider === "github" ? $t("Signing in with GitHub...") : $t("Continue with GitHub")}</span>
        </button>
      </div>
      <div class="auth-divider"><span>{$t("or use your email")}</span></div>
    </div>
  {/if}

  <div class="email-code-request">
    <label class="field-label">
      <span>{$t("Email")}</span>
      <input id="email" name="email" bind:value={email} type="email" placeholder={$t("you@example.com")} autocomplete="email" />
    </label>
    <button class="send-code-button" type="button" onclick={requestCode} disabled={loading}>{$t("Send code")}</button>
  </div>
  {#if status}
    <div class="status-alert auth-status-alert" role="status" aria-live="polite">
      <span>{status}</span>
      <button class="status-dismiss" type="button" onclick={dismissStatus} aria-label={$t("Dismiss status message")}>
        &times;
      </button>
    </div>
  {/if}
  {#if codeRequested}
    <div class="verification-step">
      <label class="field-label">
        <span>{$t("Verification code")}</span>
        <input id="login-code" name="code" bind:value={code} inputmode="numeric" placeholder={$t("123456")} autocomplete="one-time-code" />
      </label>
      <button type="button" onclick={verifyCode} disabled={loading}>{$t("Log in")}</button>
    </div>
  {/if}
</div>
