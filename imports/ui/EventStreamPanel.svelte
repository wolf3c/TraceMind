<script>
  import { t } from "./i18n/i18n";

  let {
    primaryProject,
    healthCurrent,
    projectSummaryError,
    projectSummaryLoading,
    selectedProjectSummary,
    showEventStream,
    eventStreamError,
    eventStreamLoading,
    eventStreamHasMore,
    displayedRecentEvents,
    openEventStream,
    loadMoreEvents,
    formatNumber,
    compactDate,
    eventSourceLabel,
    eventActorLabel,
  } = $props();
</script>

{#if projectSummaryError}
  <div class="inline-error" role="alert">
    <strong>{$t("Could not load current project events.")}</strong>
    <span>{projectSummaryError}</span>
  </div>
{:else if projectSummaryLoading && !selectedProjectSummary}
  <p class="empty">{$t("Loading project events...")}</p>
{:else}
  <div class="event-stream-header">
    <div class="event-stream-title">
      <span>{$t("Detailed event stream")}</span>
      <p>{showEventStream
        ? $t("Recent behavior evidence from the selected project. Showing {{count}} loaded rows.", { count: displayedRecentEvents.length })
        : $t("Open the event stream to load behavior evidence for the selected day.")}</p>
    </div>
    <div class="event-stream-total" aria-label={$t("Selected day")}>
      <span>{$t("Selected day")}</span>
      <strong>{$t("{{count}} events", {
        count: formatNumber(healthCurrent.eventCount),
      })}</strong>
    </div>
  </div>
  {#if !showEventStream}
    <div class="event-stream-collapsed">
      <button class="ghost" type="button" onclick={openEventStream} disabled={!primaryProject || eventStreamLoading} aria-expanded={showEventStream}>
        {eventStreamLoading ? $t("Loading project events...") : $t("Open event stream")}
      </button>
    </div>
  {:else if eventStreamError}
    <div class="inline-error" role="alert">
      <strong>{$t("Could not load current project events.")}</strong>
      <span>{eventStreamError}</span>
    </div>
  {:else if eventStreamLoading && !displayedRecentEvents.length}
    <p class="empty">{$t("Loading project events...")}</p>
  {:else if displayedRecentEvents.length}
    <div class="event-list" role="list">
      {#each displayedRecentEvents as event (event._id)}
        <article class="event-row" role="listitem">
          <div class="event-row-main">
            <div class="event-row-title">
              <strong>{event.title}</strong>
            </div>
            <p>{event.meaning}</p>
          </div>
          <div class="event-row-meta">
            <span>{compactDate(event.occurredAt)}</span>
            <span>{eventSourceLabel(event)}</span>
            <span>{eventActorLabel(event)}</span>
          </div>
        </article>
      {/each}
    </div>
    <div class="event-list-footer">
      <p class="event-list-note">{$t("Loaded {{count}} events.", {
        count: formatNumber(displayedRecentEvents.length),
      })}</p>
      {#if eventStreamHasMore}
        <button class="ghost" type="button" onclick={loadMoreEvents} disabled={eventStreamLoading}>
          {eventStreamLoading ? $t("Loading project events...") : $t("Load more")}
        </button>
      {/if}
    </div>
  {:else}
    <p class="empty">{$t("No current project events yet. Add the script to this project, generate behavior, then refresh.")}</p>
  {/if}
{/if}
