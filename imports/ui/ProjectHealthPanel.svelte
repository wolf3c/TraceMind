<script>
  import { t } from "./i18n/i18n";

  let {
    primaryProject,
    health,
    healthCurrent,
    delivery,
    deliveryDropped,
    selectedReportDate,
    todayReportDate,
    yesterdayReportDate,
    dayBeforeReportDate,
    projectSummaryRefreshAge,
    projectSummaryLoading,
    showActiveTimeTip,
    recentOnline,
    recentOnlineLoading,
    recentOnlineError,
    recentOnlineRefreshAge,
    selectReportDate,
    changeReportDate,
    retryProjectSummary,
    toggleActiveTimeTip,
    formatNumber,
    formatDecimal,
    formatDuration,
    formatTime,
    compactDate,
    formatTrend,
    trendClass,
    retentionText,
    topCountText,
    topItemLabel,
    bouncePageMetricText,
  } = $props();

  let recentOnlineBuckets = $derived(recentOnline?.buckets || []);
  let recentOnlineMaxBucket = $derived(Math.max(1, ...recentOnlineBuckets.map((bucket) => Number(bucket.onlineUsers || 0))));

  function recentOnlineBarHeight(bucket) {
    const value = Number(bucket?.onlineUsers || 0);
    if (!value) return "2px";
    return `${Math.max(8, Math.round((value / recentOnlineMaxBucket) * 100))}%`;
  }
</script>

<div class="events-header">
  <div>
    <div class="health-title-row">
      <span>{$t("Project health overview")}</span>
      <strong class={`health-status ${health?.status === "needs_attention" ? "needs-attention" : ""}`}>
        {health?.status === "needs_attention" ? $t("Needs attention") : $t("Normal")}
      </strong>
    </div>
    <h3>{primaryProject?.name || $t("Project")}</h3>
    <p>{$t("Daily report compared with the previous day.")}</p>
    <div class="report-date-control" aria-label={$t("Project health report date")}>
      <button class:active={selectedReportDate === todayReportDate} type="button" onclick={() => selectReportDate(todayReportDate)}>
        {$t("Today")}
      </button>
      <button class:active={selectedReportDate === yesterdayReportDate} type="button" onclick={() => selectReportDate(yesterdayReportDate)}>
        {$t("Yesterday")}
      </button>
      <button class:active={selectedReportDate === dayBeforeReportDate} type="button" onclick={() => selectReportDate(dayBeforeReportDate)}>
        {$t("Day before")}
      </button>
      <input type="date" value={selectedReportDate} max={todayReportDate} onchange={changeReportDate} aria-label={$t("Select report date")} />
    </div>
    {#if health?.attentionSummary}
      <p class="health-attention">{$t("Needs attention")}: {health.attentionSummary}</p>
    {/if}
  </div>
  <div class="refresh-control">
    <span class="refresh-age">{projectSummaryRefreshAge}</span>
    <button class="ghost" type="button" onclick={retryProjectSummary} disabled={projectSummaryLoading || !primaryProject}>
      {projectSummaryLoading ? $t("Loading project events...") : $t("Refresh")}
    </button>
  </div>
</div>
<div class="event-metrics health-metrics" aria-label="Current project health summary">
  {#if selectedReportDate === todayReportDate}
    <details class="health-card realtime-online-card">
      <summary>
        <span>{$t("Online users in last 30 minutes")}</span>
        <strong>{recentOnline ? formatNumber(recentOnline.totalOnlineUsers) : "..."}</strong>
        <small class={recentOnlineError ? "trend-negative" : "trend-flat"}>
          {recentOnlineError || (recentOnline ? recentOnlineRefreshAge : (recentOnlineLoading ? $t("Loading asynchronously") : $t("Scheduled lazy load")))}
        </small>
        <em>{$t("5-minute online users")}</em>
        <div class="realtime-bar-chart" aria-label={$t("5-minute online users")}>
          {#if recentOnlineBuckets.length}
            {#each recentOnlineBuckets as bucket, index (`recent-online-${index}-${bucket.startAt}`)}
              <div class="realtime-bar">
                <div class="realtime-bar-track" title={`${formatTime(bucket.startAt)} · ${formatNumber(bucket.onlineUsers)} ${$t("users")}`}>
                  <span style={`height: ${recentOnlineBarHeight(bucket)}`}></span>
                </div>
                <small>{formatTime(bucket.startAt)}</small>
              </div>
            {/each}
          {:else}
            <p class="realtime-placeholder">
              {recentOnlineLoading ? $t("Loading asynchronously") : $t("Waiting for lazy load")}
            </p>
          {/if}
        </div>
      </summary>
      <dl class="health-detail-list">
        <div><dt>{$t("Online users in last 30 minutes")}</dt><dd>{recentOnline ? formatNumber(recentOnline.totalOnlineUsers) : $t("No data")}</dd></div>
        <div class="health-detail-row-stacked">
          <dt>{$t("Region distribution Top 3")}</dt>
          <dd>
            {#if recentOnline?.topRegions?.length}
              <ol class="health-top-list" aria-label={$t("Region distribution Top 3")}>
                {#each recentOnline.topRegions as item, index (`recent-region-${index}-${topItemLabel(item)}-${item.count}`)}
                  <li class="health-top-item">
                    <span class="health-top-rank">{index + 1}</span>
                    <span class="health-top-label">{topItemLabel(item)}</span>
                    <strong>{formatNumber(item.count)}</strong>
                  </li>
                {/each}
              </ol>
            {:else}
              {$t("No data")}
            {/if}
          </dd>
        </div>
        <div class="health-detail-row-stacked">
          <dt>{$t("Longest pages Top 3")}</dt>
          <dd>
            {#if recentOnline?.topDurationPaths?.length}
              <ol class="health-top-list" aria-label={$t("Longest pages Top 3")}>
                {#each recentOnline.topDurationPaths as item, index (`recent-page-${index}-${topItemLabel(item)}-${item.durationMs}`)}
                  <li class="health-top-item">
                    <span class="health-top-rank">{index + 1}</span>
                    <span class="health-top-label">{topItemLabel(item)}</span>
                    <strong>{formatDuration(item.durationMs)}</strong>
                  </li>
                {/each}
              </ol>
            {:else}
              {$t("No data")}
            {/if}
          </dd>
        </div>
        <div class="health-detail-row-stacked">
          <dt>{$t("Top events Top 3")}</dt>
          <dd>
            {#if recentOnline?.topEvents?.length}
              <ol class="health-top-list" aria-label={$t("Top events Top 3")}>
                {#each recentOnline.topEvents as item, index (`recent-event-${index}-${topItemLabel(item)}-${item.count}`)}
                  <li class="health-top-item">
                    <span class="health-top-rank">{index + 1}</span>
                    <span class="health-top-label">{topItemLabel(item)}</span>
                    <strong>{formatNumber(item.count)}</strong>
                  </li>
                {/each}
              </ol>
            {:else}
              {$t("No data")}
            {/if}
          </dd>
        </div>
      </dl>
    </details>
  {/if}
  <details class="health-card">
    <summary>
      <span>{$t("Active users")}</span>
      <strong>{formatNumber(healthCurrent.activeUsers)}</strong>
      <small class={trendClass(health?.trends?.activeUsers)}>{formatTrend(health?.trends?.activeUsers)}</small>
      <em>{formatNumber(healthCurrent.newUsers)} {$t("new users")}</em>
    </summary>
    <dl class="health-detail-list">
      <div><dt>{$t("New users")}</dt><dd>{formatNumber(healthCurrent.newUsers)}</dd></div>
      <div><dt>{$t("D2 retention")}</dt><dd>{retentionText(healthCurrent.retention?.d2)}</dd></div>
      <div><dt>{$t("D3 retention")}</dt><dd>{retentionText(healthCurrent.retention?.d3)}</dd></div>
      <div><dt>{$t("D7 retention")}</dt><dd>{retentionText(healthCurrent.retention?.d7)}</dd></div>
      <div><dt>{$t("D30 retention")}</dt><dd>{retentionText(healthCurrent.retention?.d30)}</dd></div>
      <div><dt>{$t("User regions")}</dt><dd>{topCountText(healthCurrent.userRegions?.[0])}</dd></div>
      <div><dt>{$t("User devices")}</dt><dd>{topCountText(healthCurrent.deviceDistribution?.[0])}</dd></div>
    </dl>
  </details>
  <details class="health-card">
    <summary>
      <span>{$t("Active sessions")}</span>
      <strong>{formatNumber(healthCurrent.sessionCount)}</strong>
      <small class={trendClass(health?.trends?.sessions)}>{formatTrend(health?.trends?.sessions)}</small>
      <em>{formatDecimal(healthCurrent.averageSessionEvents)} {$t("events/session")}</em>
    </summary>
    <dl class="health-detail-list">
      <div><dt>{$t("Session sources")}</dt><dd>{topCountText(healthCurrent.sessionSources?.[0])}</dd></div>
      <div><dt>{$t("Session pages")}</dt><dd>{healthCurrent.sessionPaths?.[0] ? `${healthCurrent.sessionPaths[0].path} · ${formatNumber(healthCurrent.sessionPaths[0].count)}` : $t("No data")}</dd></div>
      <div><dt>{$t("Average session events")}</dt><dd>{formatDecimal(healthCurrent.averageSessionEvents)}</dd></div>
    </dl>
  </details>
  <details class="health-card">
    <summary>
      <span class="health-card-title">
        {$t("Average active time per user")}
        <button
          class="health-info-button"
          type="button"
          aria-expanded={showActiveTimeTip}
          aria-label={$t("Active time collection logic")}
          onclick={toggleActiveTimeTip}
        >i</button>
        {#if showActiveTimeTip}
          <span class="health-info-popover" role="tooltip">
            {$t("Active time counts when the app is in the foreground and the user has recent interaction. Web also requires the page to be visible and the browser window focused; missing legacy active-time data is counted as 0.")}
          </span>
        {/if}
      </span>
      <strong>{formatDuration(healthCurrent.averageActiveDurationMs)}</strong>
      <small class={trendClass(health?.trends?.averageActiveDuration)}>{formatTrend(health?.trends?.averageActiveDuration)}</small>
      <em>{$t("averaged by active users")}</em>
    </summary>
    <dl class="health-detail-list">
      <div><dt>{$t("Average active time per user")}</dt><dd>{formatDuration(healthCurrent.averageActiveDurationMs)}</dd></div>
      <div class="health-detail-row-stacked">
        <dt>{$t("Longest users Top 3")}</dt>
        <dd>
          {#if healthCurrent.topDurationUsers?.length}
            <ol class="health-top-list" aria-label={$t("Longest users Top 3")}>
              {#each healthCurrent.topDurationUsers as item, index (`duration-user-${index}-${topItemLabel(item)}-${item.durationMs}`)}
                <li class="health-top-item">
                  <span class="health-top-rank">{index + 1}</span>
                  <span class="health-top-label">{topItemLabel(item)}</span>
                  <strong>{formatDuration(item.durationMs)}</strong>
                </li>
              {/each}
            </ol>
          {:else}
            {$t("No data")}
          {/if}
        </dd>
      </div>
      <div class="health-detail-row-stacked">
        <dt>{$t("Longest pages Top 3")}</dt>
        <dd>
          {#if healthCurrent.topDurationPaths?.length}
            <ol class="health-top-list" aria-label={$t("Longest pages Top 3")}>
              {#each healthCurrent.topDurationPaths as item, index (`duration-path-${index}-${topItemLabel(item)}-${item.durationMs}`)}
                <li class="health-top-item">
                  <span class="health-top-rank">{index + 1}</span>
                  <span class="health-top-label">{topItemLabel(item)}</span>
                  <strong>{formatDuration(item.durationMs)}</strong>
                </li>
              {/each}
            </ol>
          {:else}
            {$t("No data")}
          {/if}
        </dd>
      </div>
      <div class="health-detail-row-stacked">
        <dt>{$t("Bounce pages Top 3")}</dt>
        <dd>
          {#if healthCurrent.topBouncePages?.length}
            <ol class="health-top-list" aria-label={$t("Bounce pages Top 3")}>
              {#each healthCurrent.topBouncePages as item, index (`bounce-page-${index}-${topItemLabel(item)}-${item.bounces}-${item.sessions}`)}
                <li class="health-top-item">
                  <span class="health-top-rank">{index + 1}</span>
                  <span class="health-top-label">{topItemLabel(item)}</span>
                  <strong class="health-top-metric">{bouncePageMetricText(item)}</strong>
                </li>
              {/each}
            </ol>
          {:else}
            {$t("No data")}
          {/if}
        </dd>
      </div>
      <div class="health-detail-row-stacked">
        <dt>{$t("Top events Top 3")}</dt>
        <dd>
          {#if healthCurrent.topEvents?.length}
            <ol class="health-top-list" aria-label={$t("Top events Top 3")}>
              {#each healthCurrent.topEvents as item, index (`event-${index}-${topItemLabel(item)}-${item.count}`)}
                <li class="health-top-item">
                  <span class="health-top-rank">{index + 1}</span>
                  <span class="health-top-label">{topItemLabel(item)}</span>
                  <strong>{formatNumber(item.count)}</strong>
                </li>
              {/each}
            </ol>
          {:else}
            {$t("No data")}
          {/if}
        </dd>
      </div>
    </dl>
  </details>
  <details class="health-card">
    <summary>
      <span>{$t("Total events")}</span>
      <strong>{formatNumber(healthCurrent.eventCount)}</strong>
      <small class={trendClass(health?.trends?.events)}>{formatTrend(health?.trends?.events)}</small>
      <em>{$t("user behavior events on selected day")}</em>
    </summary>
    <dl class="health-detail-list">
      <div class="health-detail-row-stacked">
        <dt>{$t("Top events Top 3")}</dt>
        <dd>
          {#if healthCurrent.topEvents?.length}
            <ol class="health-top-list" aria-label={$t("Top events Top 3")}>
              {#each healthCurrent.topEvents as item, index (`event-${index}-${topItemLabel(item)}-${item.count}`)}
                <li class="health-top-item">
                  <span class="health-top-rank">{index + 1}</span>
                  <span class="health-top-label">{topItemLabel(item)}</span>
                  <strong>{formatNumber(item.count)}</strong>
                </li>
              {/each}
            </ol>
          {:else}
            {$t("No data")}
          {/if}
        </dd>
      </div>
      <div><dt>{$t("Needs attention")}</dt><dd>{health?.attentionItems?.map((item) => item.message).join(" / ") || $t("No attention items")}</dd></div>
    </dl>
  </details>
  <details class="health-card">
    <summary>
      <span>{$t("Delivery health")}</span>
      <strong>{formatNumber(deliveryDropped)}</strong>
      <small class={delivery.failedFlushes ? "trend-negative" : "trend-flat"}>
        {delivery.failedFlushes ? `${formatNumber(delivery.failedFlushes)} ${$t("failed flushes")}` : $t("No failed flushes")}
      </small>
      <em>{$t("dropped queue records")}</em>
    </summary>
    <dl class="health-detail-list">
      <div><dt>{$t("Accepted uploads")}</dt><dd>{formatNumber(delivery.accepted)}</dd></div>
      <div><dt>{$t("Ignored uploads")}</dt><dd>{formatNumber(delivery.ignored)}</dd></div>
      <div><dt>{$t("Retry count")}</dt><dd>{formatNumber(delivery.retryCount)}</dd></div>
      <div><dt>{$t("Coalesced presence")}</dt><dd>{formatNumber(delivery.coalescedPresence)}</dd></div>
      <div><dt>{$t("Max queue depth")}</dt><dd>{formatNumber(delivery.maxQueueDepth)}</dd></div>
      <div><dt>{$t("Last successful flush")}</dt><dd>{delivery.lastSuccessfulFlushAt ? compactDate(delivery.lastSuccessfulFlushAt) : $t("No data")}</dd></div>
    </dl>
  </details>
</div>
