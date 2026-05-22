<script>
  import { t } from "./i18n/i18n";
  import { PRODUCT_UPDATES, sortProductUpdatesByDate } from "./product_updates";

  const updates = sortProductUpdatesByDate(PRODUCT_UPDATES);
</script>

<svelte:head>
  <title>{$t("Product updates")} · TraceMind</title>
</svelte:head>

<section class="product-updates-page">
  <nav class="product-updates-nav" aria-label={$t("Product updates navigation")}>
    <a class="product-updates-brand" href="/" aria-label="TraceMind">
      <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="15" fill="#FFFDF8"/>
        <path d="M17 43V21h7.5L32 35l7.5-14H47v22" fill="none" stroke="#0F2F2A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19 47c8-6 18-6 27 0" fill="none" stroke="#18A77A" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="47" cy="47" r="3.6" fill="#F2B84B"/>
      </svg>
      <span>TraceMind</span>
    </a>
    <a class="product-updates-back" href="/">{$t("Back to home")}</a>
  </nav>

  <header class="product-updates-hero">
    <p class="section-label">{$t("Product updates")}</p>
    <h1>{$t("Product updates")}</h1>
    <p>{$t("Latest TraceMind product updates, sorted newest first.")}</p>
  </header>

  <section class="product-updates-list" aria-label={$t("Product updates")}>
    {#each updates as update (update.id)}
      <article class="product-updates-card" id={update.id}>
        <time datetime={update.publishedAt}>{update.publishedAt}</time>
        <h2>{$t(update.summary)}</h2>
        <ul>
          {#each update.details as detail (detail)}
            <li>{$t(detail)}</li>
          {/each}
        </ul>
      </article>
    {/each}
  </section>
</section>
