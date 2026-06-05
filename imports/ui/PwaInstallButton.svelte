<script>
  import { onMount } from "svelte";
  import { t } from "./i18n/i18n";
  import { isIosInstallGuidanceTarget, isPwaStandalone } from "./pwa_install";

  let installPromptEvent = $state(null);
  let showIosGuidance = $state(false);
  let isInstalled = $state(false);
  let installState = $state("");

  onMount(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    isInstalled = isPwaStandalone(window);
    showIosGuidance = !isInstalled && isIosInstallGuidanceTarget(navigator);

    const handleBeforeInstallPrompt = (event) => {
      if (isPwaStandalone(window)) return;
      event.preventDefault();
      installPromptEvent = event;
      showIosGuidance = false;
      installState = "";
    };
    const handleAppInstalled = () => {
      installPromptEvent = null;
      showIosGuidance = false;
      isInstalled = true;
      installState = $t("TraceMind is installed.");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  });

  async function installTraceMind() {
    if (!installPromptEvent) return;

    installState = "";
    installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice.catch(() => null);
    installPromptEvent = null;

    if (choice?.outcome === "accepted") {
      installState = $t("TraceMind is installed.");
      isInstalled = true;
    }
  }
</script>

{#if !isInstalled && (installPromptEvent || showIosGuidance)}
  <section class="pwa-install-panel" aria-label={$t("Install TraceMind")}>
    <div class="pwa-install-copy">
      <span>{$t("Install TraceMind")}</span>
      {#if showIosGuidance}
        <p>{$t("Use the browser share menu, then choose Add to Home Screen.")}</p>
      {:else}
        <p>{$t("Open TraceMind from your device like an app.")}</p>
      {/if}
    </div>
    {#if installPromptEvent}
      <button type="button" class="pwa-install-button" onclick={installTraceMind}>
        {$t("Install")}
      </button>
    {/if}
  </section>
{:else if installState}
  <p class="pwa-install-status" role="status">{installState}</p>
{/if}
