export function mcpServerNameForProject(project = {}) {
  const rawId = typeof project === 'string' ? project : project?._id;
  const code = String(rawId || '').replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase() || 'project';
  return `tracemind-${code}`;
}
