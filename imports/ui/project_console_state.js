export function resolveSelectedProjectId(projects = [], selectedProjectId = '') {
  if (!projects.length) return '';
  return projects.some((project) => project._id === selectedProjectId)
    ? selectedProjectId
    : projects[0]._id;
}

export function resolveInitialProjectSummaryState() {
  return {
    selectedProjectSummary: null,
    projectSummaryLoading: false,
    projectSummaryError: '',
  };
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
