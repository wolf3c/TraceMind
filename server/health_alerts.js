import { Meteor } from 'meteor/meteor';
import { Email } from 'meteor/email';
import {
  Developers,
  ProjectHourlyReports,
  Projects,
  isValidEmail,
  normalizeEmail,
} from '/imports/api/tracemind';
import { attentionItemsForHealth } from '/imports/api/project_health_summary';

const HEALTH_ALERT_EMAIL_FROM = 'TraceMind <postmaster@email.super-tree.com>';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const PROJECT_HEALTH_EMAIL_ALERT_CODES = Object.freeze([
  'event_stream_stopped',
  'failure_events_increased',
]);

function allowedCodes(codes = []) {
  return [...new Set(
    (Array.isArray(codes) ? codes : [])
      .filter((code) => PROJECT_HEALTH_EMAIL_ALERT_CODES.includes(code)),
  )].sort();
}

export function buildProjectHealthEmailAlertDecision({
  state = null,
  currentReport,
  previousReport,
  now = new Date(),
} = {}) {
  if (!currentReport?.hourKey || !previousReport?.hourKey) return null;
  if (state?.evaluatedHourKey === currentReport.hourKey) return null;

  const highItems = attentionItemsForHealth(
    currentReport.current,
    previousReport.current,
    currentReport.hourEndAt,
    { comparisonWindow: 'completed_hours' },
  ).filter((item) => (
    item.severity === 'high'
    && PROJECT_HEALTH_EMAIL_ALERT_CODES.includes(item.code)
  ));
  const previousStatus = state?.status === 'open' ? 'open' : 'normal';
  const nextStatus = highItems.length ? 'open' : 'normal';
  const transition = previousStatus === nextStatus
    ? null
    : nextStatus === 'open' ? 'incident' : 'recovery';
  const nextState = nextStatus === 'open'
    ? {
        status: 'open',
        evaluatedHourKey: currentReport.hourKey,
        openedAt: previousStatus === 'open' ? state.openedAt : currentReport.hourEndAt,
        codes: previousStatus === 'open'
          ? allowedCodes(state.codes)
          : allowedCodes(highItems.map((item) => item.code)),
        updatedAt: now,
      }
    : {
        status: 'normal',
        evaluatedHourKey: currentReport.hourKey,
        updatedAt: now,
      };

  return { transition, nextState, highItems, previousState: state };
}

function safeProjectName(project) {
  return String(project?.name || 'TraceMind project')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function formatShanghai(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function buildProjectHealthAlertEmail({
  project,
  developer,
  decision,
  currentReport,
  previousReport,
  dashboardUrl,
} = {}) {
  const projectName = safeProjectName(project);
  const recovery = decision?.transition === 'recovery';
  const codes = recovery
    ? allowedCodes(decision?.previousState?.codes)
    : allowedCodes(decision?.highItems?.map((item) => item.code));
  const currentStartAt = new Date(currentReport.hourStartAt);
  const currentEndAt = new Date(currentReport.hourEndAt);

  return {
    to: normalizeEmail(developer?.email),
    from: HEALTH_ALERT_EMAIL_FROM,
    subject: `[TraceMind] ${projectName} ${recovery ? '健康信号已恢复' : '需要关注'}`,
    text: [
      `项目：${projectName}`,
      `状态：${recovery ? '健康信号已恢复' : '需要关注'}`,
      `时间窗口（UTC）：${currentStartAt.toISOString()} - ${currentEndAt.toISOString()}`,
      `时间窗口（Asia/Shanghai）：${formatShanghai(currentStartAt)} - ${formatShanghai(currentEndAt)}`,
      '健康规则：',
      ...codes.map((code) => `- ${code} (high)`),
      `当前小时事件数：${Number(currentReport.current?.eventCount || 0)}`,
      `对比小时事件数：${Number(previousReport.current?.eventCount || 0)}`,
      `当前小时失败事件数：${Number(currentReport.current?.failureEventCount || 0)}`,
      `对比小时失败事件数：${Number(previousReport.current?.failureEventCount || 0)}`,
      'Dashboard：',
      dashboardUrl,
    ].join('\n'),
  };
}

export async function evaluateProjectHealthEmailAlert(projectId, hourStartAt, {
  sendEmail = (message) => Email.sendAsync(message),
  now = new Date(),
  dashboardUrl = Meteor.absoluteUrl(),
  logger = console.error,
} = {}) {
  const project = await Projects.findOneAsync(projectId);
  if (project?.healthAlertEnabled !== true) return { status: 'disabled' };

  const currentHourStartAt = new Date(hourStartAt);
  const previousHourStartAt = new Date(currentHourStartAt.getTime() - DAY_MS);
  const [currentReport, previousReport] = await Promise.all([
    ProjectHourlyReports.findOneAsync({ projectId, hourStartAt: currentHourStartAt }),
    ProjectHourlyReports.findOneAsync({ projectId, hourStartAt: previousHourStartAt }),
  ]);
  if (!currentReport || !previousReport) return { status: 'unavailable' };

  const decision = buildProjectHealthEmailAlertDecision({
    state: project.healthAlertState,
    currentReport,
    previousReport,
    now,
  });
  if (!decision) return { status: 'unchanged' };

  const enabledProjectSelector = { _id: projectId, healthAlertEnabled: true };
  if (!decision.transition) {
    const updated = await Projects.updateAsync(enabledProjectSelector, {
      $set: { healthAlertState: decision.nextState },
    });
    return { status: updated ? 'evaluated' : 'disabled' };
  }

  const developer = await Developers.findOneAsync(project.developerId);
  if (!isValidEmail(developer?.email)) return { status: 'unavailable' };
  const message = buildProjectHealthAlertEmail({
    project,
    developer,
    decision,
    currentReport,
    previousReport,
    dashboardUrl,
  });

  try {
    await sendEmail(message);
  } catch (error) {
    logger('[TraceMind] project health email delivery failed', {
      projectId,
      transition: decision.transition,
      errorName: error?.name || 'Error',
    });
    return { status: 'failed', transition: decision.transition };
  }

  await Projects.updateAsync(enabledProjectSelector, {
    $set: { healthAlertState: decision.nextState },
  });
  return { status: 'sent', transition: decision.transition };
}
