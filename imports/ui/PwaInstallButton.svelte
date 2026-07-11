<script>
  import { onMount } from "svelte";
  import { t } from "./i18n/i18n";
  import {
    isIosInstallGuidanceTarget,
    isPwaStandalone,
    pwaInstallEntryMode,
  } from "./pwa_install";

  let installPromptEvent = $state(null);
  let iosGuidanceTarget = $state(false);
  let iosGuidanceOpen = $state(false);
  let isInstalled = $state(false);
  let installState = $state("");
  let installStatusTimer;
  let entryMode = $derived(pwaInstallEntryMode({
    isInstalled,
    hasInstallPrompt: Boolean(installPromptEvent),
    isIosGuidanceTarget: iosGuidanceTarget,
  }));

  function showInstallStatus(message) {
    installState = message;
    window.clearTimeout(installStatusTimer);
    installStatusTimer = window.setTimeout(() => {
      installState = "";
    }, 3200);
  }

  onMount(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    isInstalled = isPwaStandalone(window);
    iosGuidanceTarget = !isInstalled && isIosInstallGuidanceTarget(navigator);

    const handleBeforeInstallPrompt = (event) => {
      if (isPwaStandalone(window)) return;
      event.preventDefault();
      installPromptEvent = event;
      iosGuidanceOpen = false;
      installState = "";
    };
    const handleAppInstalled = () => {
      installPromptEvent = null;
      iosGuidanceTarget = false;
      iosGuidanceOpen = false;
      isInstalled = true;
      showInstallStatus($t("TraceMind is installed."));
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.clearTimeout(installStatusTimer);
    };
  });

  async function installTraceMind() {
    if (entryMode === "ios") {
      iosGuidanceOpen = !iosGuidanceOpen;
      return;
    }
    if (!installPromptEvent) return;

    installState = "";
    installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice.catch(() => null);
    installPromptEvent = null;

    if (choice?.outcome === "accepted") {
      isInstalled = true;
      showInstallStatus($t("TraceMind is installed."));
    }
  }
</script>

{#if entryMode !== "hidden" || installState}
  <div class="pwa-install-control">
    {#if entryMode !== "hidden"}
      <button
        type="button"
        class="ghost pwa-install-button"
        aria-expanded={entryMode === "ios" ? iosGuidanceOpen : undefined}
        aria-controls={entryMode === "ios" ? "pwa-install-guidance" : undefined}
        onclick={installTraceMind}
      >
        <span class="pwa-install-label-wide">{$t("Install app")}</span>
        <span class="pwa-install-label-compact">{$t("Install")}</span>
      </button>
    {/if}

    {#if iosGuidanceOpen}
      <div id="pwa-install-guidance" class="pwa-install-guidance" role="dialog" aria-label={$t("Install TraceMind")}>
        <div>
          <strong>{$t("Install TraceMind")}</strong>
          <p>{$t("Use the browser share menu, then choose Add to Home Screen.")}</p>
        </div>
        <button
          type="button"
          class="pwa-install-guidance-close"
          aria-label={$t("Close install guidance")}
          onclick={() => { iosGuidanceOpen = false; }}
        >
          ×
        </button>
      </div>
    {/if}

    {#if installState}
      <p class="pwa-install-status" role="status">{installState}</p>
    {/if}
  </div>
{/if}
