<script>
  import { t } from "./i18n/i18n";

  let {
    notices = [],
  } = $props();
</script>

{#if notices.length}
  <section class="project-action-notice-stack" aria-label={$t("Project action notices")}>
    {#each notices as notice (notice.id)}
      <article class="project-action-notice" role="region" aria-label={notice.ariaLabel}>
        <div class="project-action-notice-copy">
          <div class="project-action-heading">
            {#if notice.badge}
              <span class="project-action-badge">{notice.badge}</span>
            {/if}
            <h3>{notice.title}</h3>
          </div>
          {#if notice.description}
            <p>{notice.description}</p>
          {/if}
          {#if notice.resolution}
            <p class="project-action-resolution">{notice.resolution}</p>
          {/if}
          {#if notice.meta?.length}
            <dl class="project-action-meta" aria-label={notice.metaLabel}>
              {#each notice.meta as item}
                <div>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              {/each}
            </dl>
          {/if}
        </div>
        {#if notice.action}
          <div class="project-action-notice-actions">
            <button
              class:copied={notice.action.copied}
              class="project-action-copy"
              type="button"
              onclick={notice.action.onClick}
              disabled={notice.action.disabled}
            >
              {notice.action.label}
            </button>
            {#if notice.action.state}
              <span class="project-action-copy-state" role="status">{notice.action.state}</span>
            {/if}
          </div>
        {/if}
      </article>
    {/each}
  </section>
{/if}
