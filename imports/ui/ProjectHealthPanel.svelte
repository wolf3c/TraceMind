<script>
  import HourlyTrendSparkline from "./HourlyTrendSparkline.svelte";
  import { DATA_RETENTION_POLICY } from "../api/data_retention";
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
    canRefreshProjectHealth,
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
    formatTrendContext,
    trendClass,
    retentionText,
    topCountText,
    topItemLabel,
    bouncePageMetricText,
  } = $props();

  let recentOnlineBuckets = $derived(recentOnline?.buckets || []);
  let recentOnlineMaxBucket = $derived(Math.max(1, ...recentOnlineBuckets.map((bucket) => Number(bucket.onlineUsers || 0))));
  let completedHoursComparison = $derived(health?.window?.comparisonMode === "completed_hours");
  let healthSamplesPending = $derived(completedHoursComparison && Number(health?.window?.currentHourCount || 0) === 0);
  let hourlyMetrics = $derived(health?.hourlyComparison?.metrics || {});

  function recentOnlineBarHeight(bucket) {
    const value = Number(bucket?.onlineUsers || 0);
    if (!value) return "2px";
    return `${Math.max(8, Math.round((value / recentOnlineMaxBucket) * 100))}%`;
  }

  function trendText(value) {
    return healthSamplesPending ? $t("Waiting for completed hour") : formatTrend(value);
  }

  function trendDescription(value) {
    return healthSamplesPending ? $t("Waiting for completed hour") : formatTrendContext(value, health?.window?.comparisonMode);
  }

  function metricTrendClass(value) {
    return healthSamplesPending ? "trend-flat" : trendClass(value);
  }

  const deliveryRetention = DATA_RETENTION_POLICY.detailWindows.find((item) => item.dataSet === "capture_delivery_reports")?.retentionDays || 7;
  const detailRetention = DATA_RETENTION_POLICY.detailWindows.find((item) => item.dataSet === "raw_behaviors")?.retentionDays || 30;
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
    <p>{completedHoursComparison ? $t("Completed hours compared with yesterday same hours.") : $t("Daily report compared with the previous day.")}</p>
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
    {#if canRefreshProjectHealth}
      <button class="ghost" type="button" onclick={retryProjectSummary} disabled={!primaryProject}>
        {$t("Refresh")}
      </button>
    {/if}
  </div>
</div>
<div class="event-metrics health-metrics" aria-label="Current project health summary">
  {#if selectedReportDate === todayReportDate}
    <details class="health-card realtime-online-card">
      <summary>
        <div class="realtime-card-head">
          <span>
            {$t("Online users in last 30 minutes")}
            <small class={recentOnlineError ? "trend-negative" : "trend-flat"}>
              {recentOnlineError || (recentOnline ? recentOnlineRefreshAge : (recentOnlineLoading ? $t("Loading asynchronously") : $t("Scheduled lazy load")))}
            </small>
          </span>
          <strong>{recentOnline ? formatNumber(recentOnline.totalOnlineUsers) : "..."}</strong>
        </div>
        <em>{$t("5-minute online users")}</em>
        <div class="realtime-bar-chart" aria-label={$t("5-minute online users")}>
          {#if recentOnlineBuckets.length}
            {#each recentOnlineBuckets as bucket, index (`recent-online-${index}-${bucket.startAt}`)}
              <div class="realtime-bar">
                <strong class="realtime-bar-value">{formatNumber(bucket.onlineUsers)}</strong>
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
  <details class="health-card hourly-trend-card">
    <summary>
      <span>{$t("Active users")}</span>
      <div class="health-metric-row">
        <strong>{healthSamplesPending ? $t("No samples yet") : formatNumber(healthCurrent.activeUsers)}</strong>
        <span class="health-metric-side">
          <em>{healthSamplesPending ? $t("Current hour is excluded") : `${formatNumber(healthCurrent.newUsers)} ${$t("new users")}`}</em>
          <span class={`trend-inline ${metricTrendClass(health?.trends?.activeUsers)}`} title={trendDescription(health?.trends?.activeUsers)} aria-label={trendDescription(health?.trends?.activeUsers)}>
            {trendText(health?.trends?.activeUsers)}
          </span>
        </span>
      </div>
      {#if !healthSamplesPending}
        <HourlyTrendSparkline points={hourlyMetrics.activeUsers} formatValue={formatNumber} />
      {/if}
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
  <details class="health-card hourly-trend-card">
    <summary>
      <span>{$t("Active sessions")}</span>
      <div class="health-metric-row">
        <strong>{healthSamplesPending ? $t("No samples yet") : formatNumber(healthCurrent.sessionCount)}</strong>
        <span class="health-metric-side">
          <em>{healthSamplesPending ? $t("Current hour is excluded") : `${formatDecimal(healthCurrent.averageSessionEvents)} ${$t("events/session")}`}</em>
          <span class={`trend-inline ${metricTrendClass(health?.trends?.sessions)}`} title={trendDescription(health?.trends?.sessions)} aria-label={trendDescription(health?.trends?.sessions)}>
            {trendText(health?.trends?.sessions)}
          </span>
        </span>
      </div>
      {#if !healthSamplesPending}
        <HourlyTrendSparkline points={hourlyMetrics.sessions} formatValue={formatNumber} />
      {/if}
    </summary>
    <dl class="health-detail-list">
      <div><dt>{$t("Session sources")}</dt><dd>{topCountText(healthCurrent.sessionSources?.[0])}</dd></div>
      <div><dt>{$t("Session pages")}</dt><dd>{healthCurrent.sessionPaths?.[0] ? `${healthCurrent.sessionPaths[0].path} · ${formatNumber(healthCurrent.sessionPaths[0].count)}` : $t("No data")}</dd></div>
      <div><dt>{$t("Average session events")}</dt><dd>{formatDecimal(healthCurrent.averageSessionEvents)}</dd></div>
    </dl>
  </details>
  <details class="health-card">
    <summary>
      <span>{$t("Traffic sources")}</span>
      <strong>{healthSamplesPending ? $t("No samples yet") : (healthCurrent.trafficSources?.[0] ? topItemLabel(healthCurrent.trafficSources[0]) : $t("No data"))}</strong>
      <small class="trend-flat">
        {healthSamplesPending ? $t("Waiting for completed hour") : (healthCurrent.trafficSources?.[0] ? `${formatNumber(healthCurrent.trafficSources[0].count)} ${$t("visits")}` : $t("No data"))}
      </small>
      <em>{healthSamplesPending ? $t("Current hour is excluded") : $t("first-touch attribution")}</em>
    </summary>
    <dl class="health-detail-list">
      <div class="health-detail-row-stacked">
        <dt>{$t("Top traffic sources")}</dt>
        <dd>
          {#if healthCurrent.trafficSources?.length}
            <ol class="health-top-list" aria-label={$t("Top traffic sources")}>
              {#each healthCurrent.trafficSources as item, index (`traffic-source-${index}-${topItemLabel(item)}-${item.count}`)}
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
        <dt>{$t("Top traffic mediums")}</dt>
        <dd>
          {#if healthCurrent.trafficMediums?.length}
            <ol class="health-top-list" aria-label={$t("Top traffic mediums")}>
              {#each healthCurrent.trafficMediums as item, index (`traffic-medium-${index}-${topItemLabel(item)}-${item.count}`)}
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
        <dt>{$t("Top campaigns")}</dt>
        <dd>
          {#if healthCurrent.trafficCampaigns?.length}
            <ol class="health-top-list" aria-label={$t("Top campaigns")}>
              {#each healthCurrent.trafficCampaigns as item, index (`traffic-campaign-${index}-${topItemLabel(item)}-${item.count}`)}
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
        <dt>{$t("Top landing pages")}</dt>
        <dd>
          {#if healthCurrent.trafficLandingPaths?.length}
            <ol class="health-top-list" aria-label={$t("Top landing pages")}>
              {#each healthCurrent.trafficLandingPaths as item, index (`traffic-landing-${index}-${topItemLabel(item)}-${item.count}`)}
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
  <details class="health-card hourly-trend-card">
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
      <div class="health-metric-row">
        <strong>{healthSamplesPending ? $t("No samples yet") : formatDuration(healthCurrent.averageActiveDurationMs)}</strong>
        <span class="health-metric-side">
          <em>{healthSamplesPending ? $t("Current hour is excluded") : $t("averaged by active users")}</em>
          <span class={`trend-inline ${metricTrendClass(health?.trends?.averageActiveDuration)}`} title={trendDescription(health?.trends?.averageActiveDuration)} aria-label={trendDescription(health?.trends?.averageActiveDuration)}>
            {trendText(health?.trends?.averageActiveDuration)}
          </span>
        </span>
      </div>
      {#if !healthSamplesPending}
        <HourlyTrendSparkline points={hourlyMetrics.averageActiveDuration} formatValue={formatDuration} />
      {/if}
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
  <details class="health-card hourly-trend-card">
    <summary>
      <span>{$t("Total events")}</span>
      <div class="health-metric-row">
        <strong>{healthSamplesPending ? $t("No samples yet") : formatNumber(healthCurrent.eventCount)}</strong>
        <span class="health-metric-side">
          <em>{healthSamplesPending ? $t("Current hour is excluded") : $t("user behavior events on selected day")}</em>
          <span class={`trend-inline ${metricTrendClass(health?.trends?.events)}`} title={trendDescription(health?.trends?.events)} aria-label={trendDescription(health?.trends?.events)}>
            {trendText(health?.trends?.events)}
          </span>
        </span>
      </div>
      {#if !healthSamplesPending}
        <HourlyTrendSparkline points={hourlyMetrics.events} formatValue={formatNumber} />
      {/if}
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
  <details class="health-card">
    <summary>
      <span>{$t("Data retention")}</span>
      <strong>{detailRetention} {$t("days")}</strong>
      <small>{$t("raw behavior and presence detail")}</small>
      <em>{$t("delivery diagnostics keep {{days}} days", { days: deliveryRetention })}</em>
    </summary>
    <dl class="health-detail-list">
      <div><dt>{$t("Delivery diagnostics")}</dt><dd>{$t("Detailed upload diagnostics are retained for {{days}} days.", { days: deliveryRetention })}</dd></div>
      <div><dt>{$t("Presence sessions")}</dt><dd>{$t("Session-level online detail is retained for {{days}} days.", { days: detailRetention })}</dd></div>
      <div><dt>{$t("Raw behaviors")}</dt><dd>{$t("Raw behavior logs are retained for {{days}} days.", { days: detailRetention })}</dd></div>
      <div><dt>{$t("Long-term reports")}</dt><dd>{$t("Semantic events and daily/hourly health reports remain the source for older analysis.")}</dd></div>
    </dl>
  </details>
</div>
