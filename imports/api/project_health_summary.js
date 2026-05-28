export const HEALTH_RETENTION_DAYS = [2, 3, 7, 30];
export const DAILY_REPORT_TIMEZONE = 'Asia/Shanghai';

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function percentChange(current, previous) {
  if (!previous) return current ? 1 : 0;
  return (current - previous) / previous;
}

function formatPercentForMessage(value) {
  return `${Math.round(Math.abs(value) * 100)}%`;
}

export function emptyHealthWindow() {
  return {
    activeUsers: 0,
    eventCount: 0,
    sessionCount: 0,
    failureEventCount: 0,
    lastEventAt: null,
    totalDurationMs: 0,
    averageActiveDurationMs: 0,
    averageSessionEvents: 0,
    topEvents: [],
    userRegions: [],
    deviceDistribution: [],
    sessionSources: [],
    sessionPaths: [],
    trafficSources: [],
    trafficMediums: [],
    trafficCampaigns: [],
    trafficLandingPaths: [],
    topDurationUsers: [],
    topDurationPaths: [],
    topBouncePages: [],
    sdkUpgradeFindings: [],
    newUsers: 0,
    retention: Object.fromEntries(
      HEALTH_RETENTION_DAYS.map((day) => [`d${day}`, { sampleSize: 0, retainedUsers: 0, rate: null }]),
    ),
  };
}

export function emptyHourlyComparison({
  comparisonMode = 'full_day',
  currentHourCount = 0,
  previousHourCount = 0,
} = {}) {
  return {
    granularity: 'hour_rollup',
    comparisonMode,
    currentHourCount,
    previousHourCount,
    metrics: {
      activeUsers: [],
      sessions: [],
      averageActiveDuration: [],
      events: [],
    },
  };
}

function attentionWindowLabels(comparisonWindow) {
  if (comparisonWindow === 'completed_hours') {
    return {
      currentWindow: '所选日期已结束小时',
      previousWindow: '昨天同一时段',
      previousFullWindow: '昨天同一时段',
      trailingWindow: '最近 3 个已结束小时',
    };
  }

  if (comparisonWindow === 'day') {
    return {
      currentWindow: '所选日期',
      previousWindow: '前一天',
      previousFullWindow: '前一天',
      trailingWindow: '所选日期最后 3 小时',
    };
  }

  return {
    currentWindow: '近 24h',
    previousWindow: '前 24h',
    previousFullWindow: '前一个 24h',
    trailingWindow: '最近 3 小时',
  };
}

export function attentionItemsForHealth(current, previous, now, { comparisonWindow = 'rolling_24h' } = {}) {
  const items = [];
  const labels = attentionWindowLabels(comparisonWindow);
  const activeUsersChange = percentChange(current.activeUsers, previous.activeUsers);
  const sessionsChange = percentChange(current.sessionCount, previous.sessionCount);
  const eventsChange = percentChange(current.eventCount, previous.eventCount);

  if (previous.eventCount > 0 && current.eventCount === 0) {
    items.push({ code: 'event_stream_stopped', severity: 'high', message: `${labels.currentWindow}没有新事件，但${labels.previousFullWindow}有事件。` });
  }
  if (current.lastEventAt && now.getTime() - current.lastEventAt.getTime() >= 3 * 60 * 60 * 1000 && previous.eventCount > 0) {
    items.push({ code: 'no_recent_events', severity: 'medium', message: `${labels.trailingWindow}没有收到新事件。` });
  }
  if (previous.activeUsers >= 3 && activeUsersChange <= -0.4) {
    items.push({ code: 'active_users_dropped', severity: 'medium', message: `${labels.currentWindow}活跃用户较${labels.previousWindow}下降 ${formatPercentForMessage(activeUsersChange)}。` });
  }
  if (previous.sessionCount >= 3 && sessionsChange <= -0.4) {
    items.push({ code: 'sessions_dropped', severity: 'medium', message: `${labels.currentWindow}活跃会话较${labels.previousWindow}下降 ${formatPercentForMessage(sessionsChange)}。` });
  }
  if (previous.eventCount >= 5 && eventsChange <= -0.4) {
    items.push({ code: 'events_dropped', severity: 'medium', message: `${labels.currentWindow}用户行为事件较${labels.previousWindow}下降 ${formatPercentForMessage(eventsChange)}。` });
  }
  if (previous.eventCount >= 5 && eventsChange >= 1) {
    items.push({ code: 'events_spiked', severity: 'low', message: `${labels.currentWindow}用户行为事件较${labels.previousWindow}上升 ${formatPercentForMessage(eventsChange)}。` });
  }
  if (current.failureEventCount > previous.failureEventCount && current.failureEventCount > 0) {
    items.push({ code: 'failure_events_increased', severity: 'high', message: `${labels.currentWindow}失败或错误事件 ${current.failureEventCount} 条，高于${labels.previousFullWindow}。` });
  }

  const topEvent = current.topEvents[0];
  if (topEvent && current.eventCount >= 10 && topEvent.count / current.eventCount >= 0.8) {
    items.push({ code: 'top_event_concentration', severity: 'low', message: `${labels.currentWindow}高频事件 ${topEvent.label} 占比过高。` });
  }

  return items;
}

export function summarizeProjectHealthFromDailyReports({
  currentReport,
  previousReport,
  retention = null,
} = {}) {
  const comparisonMode = currentReport?.comparisonWindow?.mode || 'full_day';
  const current = {
    ...emptyHealthWindow(),
    ...(currentReport?.current || {}),
    newUsers: Number(currentReport?.current?.newUsers ?? currentReport?.newActorKeys?.length ?? 0),
    retention: retention || emptyHealthWindow().retention,
  };
  const previous = {
    ...emptyHealthWindow(),
    ...(currentReport?.previous || previousReport?.current || {}),
    newUsers: Number(currentReport?.previous?.newUsers ?? previousReport?.current?.newUsers ?? previousReport?.newActorKeys?.length ?? 0),
  };
  const currentStart = validDate(currentReport?.sourceWindow?.startAt);
  const currentEnd = validDate(currentReport?.sourceWindow?.endAt);
  const previousStart = validDate(currentReport?.comparisonWindow?.previousStartAt) || validDate(previousReport?.sourceWindow?.startAt);
  const previousEnd = validDate(currentReport?.comparisonWindow?.previousEndAt) || validDate(previousReport?.sourceWindow?.endAt);
  const attentionItems = attentionItemsForHealth(current, previous, currentEnd || new Date(), {
    comparisonWindow: comparisonMode === 'completed_hours' ? 'completed_hours' : 'day',
  });
  const sdkUpgradeFindings = current.sdkUpgradeFindings || [];

  return {
    window: {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      reportDate: currentReport?.reportDate || '',
      previousReportDate: currentReport?.previousReportDate || previousReport?.reportDate || '',
      granularity: currentReport?.comparisonWindow?.granularity || 'day',
      comparisonMode,
      currentHourCount: Number(currentReport?.comparisonWindow?.currentHourCount || 0),
      previousHourCount: Number(currentReport?.comparisonWindow?.previousHourCount || 0),
      timezone: DAILY_REPORT_TIMEZONE,
      retentionDays: HEALTH_RETENTION_DAYS,
    },
    hourlyComparison: currentReport?.hourlyComparison || emptyHourlyComparison({
      comparisonMode,
      currentHourCount: Number(currentReport?.comparisonWindow?.currentHourCount || 0),
      previousHourCount: Number(currentReport?.comparisonWindow?.previousHourCount || 0),
    }),
    status: attentionItems.length || sdkUpgradeFindings.length ? 'needs_attention' : 'normal',
    attentionSummary: attentionItems[0]?.message || sdkUpgradeFindings[0]?.message || '',
    attentionItems,
    sdkUpgradeFindings,
    current,
    previous,
    trends: currentReport?.trends || {
      activeUsers: percentChange(current.activeUsers, previous.activeUsers),
      sessions: percentChange(current.sessionCount, previous.sessionCount),
      averageActiveDuration: percentChange(current.averageActiveDurationMs, previous.averageActiveDurationMs),
      events: percentChange(current.eventCount, previous.eventCount),
    },
  };
}
