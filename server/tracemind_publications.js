import { Meteor } from 'meteor/meteor';
import { Developers, ProjectDailyReports, Projects } from '/imports/api/tracemind';

const DAILY_REPORT_PUBLIC_FIELDS = {
  projectId: 1,
  reportDate: 1,
  timezone: 1,
  status: 1,
  computedAt: 1,
  sourceWindow: 1,
  current: 1,
  delivery: 1,
  createdAt: 1,
  updatedAt: 1,
};

function normalizeReportDates(reportDates = []) {
  return [...new Set(
    (Array.isArray(reportDates) ? reportDates : [reportDates])
      .map((date) => String(date || '').trim())
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
  )].slice(0, 10);
}

Meteor.publish('tracemind.project.dailyReports', async function publishProjectDailyReports(projectId, reportDates) {
  if (!this.userId) return [];

  const dates = normalizeReportDates(reportDates);
  if (!projectId || !dates.length) return [];

  const developer = await Developers.findOneAsync({ userId: this.userId }, { fields: { _id: 1 } });
  if (!developer) return [];

  const project = await Projects.findOneAsync(
    { _id: projectId, developerId: developer._id },
    { fields: { _id: 1 } },
  );
  if (!project) return [];

  return ProjectDailyReports.find(
    { projectId: project._id, reportDate: { $in: dates } },
    { fields: DAILY_REPORT_PUBLIC_FIELDS },
  );
});
