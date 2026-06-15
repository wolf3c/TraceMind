export function resolveSelectedProjectId(projects = [], selectedProjectId = '') {
  if (!projects.length) return '';
  return projects.some((project) => project._id === selectedProjectId)
    ? selectedProjectId
    : projects[0]._id;
}

export function mergeProjectIntoDashboard(dashboard, updatedProject) {
  if (!dashboard || !updatedProject?._id) return dashboard;

  const projects = dashboard.projects || [];
  const exists = projects.some((project) => project._id === updatedProject._id);

  return {
    ...dashboard,
    projects: exists
      ? projects.map((project) => (
        project._id === updatedProject._id ? updatedProject : project
      ))
      : [...projects, updatedProject],
  };
}

function sourceMapKey(source = {}) {
  const sourceType = String(source.sourceType || '').trim().toLowerCase();
  const sourceKey = String(source.sourceKey || '').trim().toLowerCase();
  return sourceType && sourceKey ? `${sourceType}:${sourceKey}` : '';
}

function unblockedSource(source) {
  const { reason, blockedAt, ...rest } = source;
  return { ...rest, blocked: false };
}

export function mergeBlockedSourcesIntoSourceSummary(sourceSummary = [], blockedSources = []) {
  const blockedByKey = new Map();
  blockedSources.forEach((source) => {
    const key = sourceMapKey(source);
    if (key) blockedByKey.set(key, source);
  });

  const sourcesByKey = new Map();
  sourceSummary.forEach((source) => {
    const key = sourceMapKey(source);
    if (!key) return;

    const blockedSource = blockedByKey.get(key);
    sourcesByKey.set(key, blockedSource ? {
      ...source,
      sourceLabel: source.sourceLabel || blockedSource.sourceLabel || source.sourceKey,
      blocked: true,
      reason: blockedSource.reason || '',
      blockedAt: blockedSource.blockedAt,
    } : unblockedSource(source));
  });

  blockedByKey.forEach((source, key) => {
    if (sourcesByKey.has(key)) return;
    sourcesByKey.set(key, {
      sourceType: source.sourceType,
      sourceKey: source.sourceKey,
      sourceLabel: source.sourceLabel || source.sourceKey,
      count: 0,
      lastSeenAt: null,
      blocked: true,
      reason: source.reason || '',
      blockedAt: source.blockedAt,
    });
  });

  return [...sourcesByKey.values()]
    .filter((source) => source.blocked || Number(source.count) || source.lastSeenAt)
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return new Date(right.lastSeenAt || 0) - new Date(left.lastSeenAt || 0);
    });
}

export function resolveInitialProjectSummaryState() {
  return {
    selectedProjectSummary: null,
    projectSummaryLoading: false,
    projectSummaryError: '',
  };
}

export function resolveInitialSetupDetailsState() {
  return false;
}

export function shouldLoadProjectSummaryForSetup({
  projectId,
  reportDate,
  selectedProjectSummary,
  projectSummaryLoading,
} = {}) {
  if (!projectId || !reportDate || projectSummaryLoading) return false;
  return selectedProjectSummary?.project?._id !== projectId
    || selectedProjectSummary?.summaryWindow?.reportDate !== reportDate;
}

export function shouldShowProjectHealthRefresh({
  selectedReportDate,
  todayReportDate,
} = {}) {
  return Boolean(selectedReportDate && todayReportDate && selectedReportDate === todayReportDate);
}

export function shouldApplyProjectSummaryResponse({
  requestId,
  activeRequestId,
  requestUserId,
  currentUserId,
  projectId,
  selectedProjectId,
}) {
  return requestId === activeRequestId
    && requestUserId === currentUserId
    && projectId === selectedProjectId;
}
