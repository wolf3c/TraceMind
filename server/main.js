import { Meteor } from 'meteor/meteor';
import './tracemind_methods';
import { registerTraceMindRoutes } from './capture_routes';
import { ensureTraceMindIndexes, startDailyReportJob, computeFinalReportsForYesterday } from './daily_reports';
import { startSemanticExtractionJob, extractSemanticEventsOnce } from './semantic_jobs';

registerTraceMindRoutes();

Meteor.startup(() => {
  ensureTraceMindIndexes().catch((error) => {
    console.error('[TraceMind] index initialization failed', error);
  });
  startSemanticExtractionJob();
  startDailyReportJob();
  extractSemanticEventsOnce().catch((error) => {
    console.error('[TraceMind] initial semantic extraction failed', error);
  });
  computeFinalReportsForYesterday().catch((error) => {
    console.error('[TraceMind] initial daily report finalization failed', error);
  });
});
