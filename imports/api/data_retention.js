export const DATA_RETENTION_POLICY = Object.freeze({
  detailWindows: [
    {
      dataSet: 'capture_delivery_reports',
      collectionName: 'tracemind_capture_delivery_reports',
      label: 'Capture delivery diagnostics',
      retentionDays: 7,
      dateField: 'createdAt',
      usage: 'Recent upload health diagnostics including accepted, ignored, retry, drop, queue-depth, and flush status.',
    },
    {
      dataSet: 'presence_sessions',
      collectionName: 'tracemind_presence_sessions',
      label: 'Presence sessions',
      retentionDays: 10,
      dateField: 'lastSeenAt',
      usage: 'Recent session-level online, active-time, and page-duration detail.',
    },
    {
      dataSet: 'raw_behaviors',
      collectionName: 'tracemind_raw_behaviors',
      label: 'Raw behavior logs',
      retentionDays: 10,
      dateField: 'occurredAt',
      usage: 'Recent raw capture facts for verifying semantic event evidence.',
    },
    {
      dataSet: 'semantic_events',
      collectionName: 'tracemind_semantic_events',
      label: 'Semantic events',
      retentionDays: 10,
      dateField: 'occurredAt',
      usage: 'Recent AI-readable behavior evidence for MCP drilldown.',
    },
  ],
  retainedSummaries: [
    {
      dataSet: 'project_hourly_reports',
      collectionName: 'tracemind_project_hourly_reports',
      label: 'Hourly health reports',
      retentionDays: null,
      usage: 'Aggregated hourly health trends for older online and delivery analysis.',
    },
    {
      dataSet: 'project_daily_reports',
      collectionName: 'tracemind_project_daily_reports',
      label: 'Daily health reports',
      retentionDays: null,
      usage: 'Long-term daily health trends.',
    },
  ],
  note: 'If detail outside these windows is unavailable, use project_health and hourly/daily reports before assuming data loss.',
});
