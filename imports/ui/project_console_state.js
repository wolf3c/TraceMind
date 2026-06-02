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
