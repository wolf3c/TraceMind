export function resolveConsoleState({
  dashboard,
  userId,
  loggingIn,
  dashboardLoadError,
}) {
  if (dashboard) return 'ready';
  if (userId && dashboardLoadError) return 'dashboard-error';
  if (userId) return 'loading-dashboard';
  if (loggingIn) return 'restoring-session';
  return 'signed-out';
}
