<script>
  import { t } from "./i18n/i18n";
  import {
    productUpdateDetailPath,
    productUpdateNotificationState,
    productUpdatesPath,
    readDismissedProductUpdateId,
    writeDismissedProductUpdateId,
  } from "./product_updates";

  let { appVersion = "", canShowReminder = false } = $props();

  let dismissedId = $state(readDismissedProductUpdateId(
    typeof window === "undefined" ? undefined : window.localStorage,
  ));
  let notification = $derived(productUpdateNotificationState(undefined, dismissedId, canShowReminder));
  let update = $derived(notification.update);
  let hasUnreadUpdate = $derived(notification.hasUnreadUpdate);
  let detailPath = $derived(productUpdateDetailPath(update));

  function dismissNotice(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!update?.id) return;
    writeDismissedProductUpdateId(window.localStorage, update.id);
    dismissedId = update.id;
  }
</script>

<section class="product-update-notice" aria-label={$t("Product update")}>
  <div class="product-update-version-row">
    <span class="product-update-version">TraceMind v{appVersion}</span>
    <span class="product-update-separator" aria-hidden="true">·</span>
    <a class="product-update-history-link" href={productUpdatesPath}>
      {$t("Update history")}
      {#if hasUnreadUpdate}
        <span class="product-update-unread-dot" aria-hidden="true"></span>
        <span class="sr-only">{$t("Unread product update available")}</span>
      {/if}
    </a>
  </div>

  {#if update && hasUnreadUpdate}
    <article class="product-update-notice-card">
      <a
        class="product-update-card-link"
        href={detailPath}
        aria-label={$t("View update details for {{title}}", { title: $t(update.moduleTitle) })}
      ></a>

      <button
        class="product-update-dismiss"
        type="button"
        aria-label={$t("Dismiss product update")}
        onclick={dismissNotice}
      >
        ×
      </button>

      <div class="product-update-copy">
        <span class="product-update-category">{$t(update.categoryLabel)}</span>
        <h2>{$t(update.moduleTitle)}</h2>
        <p>{$t(update.summary)}</p>
      </div>

      <time class="product-update-date" datetime={update.publishedAt}>{update.publishedAt}</time>
      <a class="product-update-detail" href={detailPath}>{$t("Details")}</a>
    </article>
  {/if}
</section>
