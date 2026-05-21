<script>
  import { t } from "./i18n/i18n";
  import {
    FEEDBACK_KIND_OPTIONS,
    buildFeedbackMessage,
  } from "./feedback_payload";

  let {
    accountEmail = "",
  } = $props();

  let showFeedbackForm = $state(false);
  let feedbackKind = $state("issue");
  let feedbackTitle = $state("");
  let feedbackBody = $state("");
  let contactConsent = $state(false);
  let contactAddress = $state("");
  let feedbackError = $state("");
  let feedbackStatus = $state("");
  let feedbackStatusTimer = null;

  const signedInEmail = $derived(String(accountEmail || "").trim());
  const contactAddressValue = $derived(signedInEmail || contactAddress);
  const canSubmitFeedback = $derived(Boolean(feedbackBody.trim()));

  function openFeedbackForm() {
    showFeedbackForm = true;
    feedbackError = "";
    feedbackStatus = "";
  }

  function closeFeedbackForm() {
    showFeedbackForm = false;
    feedbackError = "";
  }

  function resetFeedbackForm() {
    feedbackKind = "issue";
    feedbackTitle = "";
    feedbackBody = "";
    contactConsent = false;
    contactAddress = "";
  }

  function showFeedbackStatus(message) {
    feedbackStatus = message;
    if (feedbackStatusTimer) window.clearTimeout(feedbackStatusTimer);
    feedbackStatusTimer = window.setTimeout(() => {
      feedbackStatus = "";
      feedbackStatusTimer = null;
    }, 3200);
  }

  function submitFeedback(event) {
    event.preventDefault();
    feedbackError = "";
    feedbackStatus = "";

    const result = buildFeedbackMessage({
      kind: feedbackKind,
      title: feedbackTitle,
      body: feedbackBody,
      contactConsent,
      contactAddress: contactAddressValue,
    });
    if (!result.ok) {
      feedbackError = result.error;
      return;
    }

    const traceMind = typeof window === "undefined" ? null : window.TraceMind;
    if (!traceMind?.submitFeedback) {
      feedbackError = "TraceMind feedback is not ready yet. Try again after the page finishes loading.";
      return;
    }

    const queued = traceMind.submitFeedback({ message: result.message });
    if (!queued?.queued) {
      feedbackError = "TraceMind feedback is not ready yet. Try again after the page finishes loading.";
      return;
    }

    try {
      Promise.resolve(traceMind.flush?.()).catch(() => {});
    } catch {
      // Feedback is already queued locally; a flush failure should not block the user.
    }
    resetFeedbackForm();
    showFeedbackStatus("Feedback queued. TraceMind will send it shortly.");
    showFeedbackForm = false;
  }
</script>

<div class="feedback-widget" aria-live="polite">
  <button class="feedback-trigger" type="button" onclick={openFeedbackForm}>
    {$t("Feedback")}
  </button>

  {#if feedbackStatus}
    <p class="feedback-toast" role="status">{$t(feedbackStatus)}</p>
  {/if}

  {#if showFeedbackForm}
    <div class="feedback-modal-layer">
      <button
        class="feedback-backdrop"
        type="button"
        aria-label={$t("Close feedback")}
        onclick={closeFeedbackForm}
      ></button>
      <div
        class="feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <div class="feedback-modal-header">
          <div>
            <span class="tm-badge tm-badge-muted">{$t("Feedback")}</span>
            <h2 id="feedback-title">{$t("Send feedback")}</h2>
          </div>
          <button class="ghost feedback-close" type="button" onclick={closeFeedbackForm} aria-label={$t("Close feedback")}>
            &times;
          </button>
        </div>

        <form class="feedback-form" onsubmit={submitFeedback}>
          <label class="field-label" for="feedback-kind">
            <span>{$t("Feedback type")}</span>
            <select id="feedback-kind" name="feedbackKind" bind:value={feedbackKind}>
              {#each FEEDBACK_KIND_OPTIONS as option (option.value)}
                <option value={option.value}>{$t(option.label)}</option>
              {/each}
            </select>
          </label>

          <label class="field-label" for="feedback-title-input">
            <span>{$t("Title (optional)")}</span>
            <input id="feedback-title-input" name="feedbackTitle" bind:value={feedbackTitle} maxlength="160" placeholder={$t("Short summary")} />
          </label>

          <label class="field-label" for="feedback-body">
            <span>{$t("Feedback details")}</span>
            <textarea
              id="feedback-body"
              name="feedbackBody"
              bind:value={feedbackBody}
              maxlength="4000"
              rows="5"
              required
              placeholder={$t("Describe the issue, idea, or question.")}
            ></textarea>
          </label>

          {#if signedInEmail}
            <label class="feedback-consent-row" for="feedback-contact-consent">
              <input id="feedback-contact-consent" name="contactConsent" type="checkbox" bind:checked={contactConsent} />
              <span>{$t("I agree to use my current account email for follow-up.")}</span>
            </label>
          {:else}
            <label class="feedback-consent-row" for="feedback-contact-consent">
              <input id="feedback-contact-consent" name="contactConsent" type="checkbox" bind:checked={contactConsent} />
              <span>{$t("I agree to be contacted about this feedback.")}</span>
            </label>
            {#if contactConsent}
              <label class="field-label" for="feedback-contact-address">
                <span>{$t("Contact email (optional)")}</span>
                <input id="feedback-contact-address" name="contactAddress" bind:value={contactAddress} type="email" autocomplete="email" />
              </label>
            {/if}
          {/if}

          {#if feedbackError}
            <p class="feedback-error" role="alert">{$t(feedbackError)}</p>
          {/if}

          <div class="feedback-actions">
            <button type="submit" disabled={!canSubmitFeedback}>
              {$t("Submit feedback")}
            </button>
            <button class="ghost" type="button" onclick={closeFeedbackForm}>
              {$t("Cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>
