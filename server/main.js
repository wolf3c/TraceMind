import { Meteor } from 'meteor/meteor';
import './oauth_accounts';
import './tracemind_methods';
import './tracemind_publications';
import { registerTraceMindRoutes, startProductUsageInstrumentation } from './capture_routes';
import { ensureTraceMindIndexes, startDailyReportJob, computeFinalReportsForYesterday } from './daily_reports';
import { startSemanticExtractionJob, extractSemanticEventsOnce } from './semantic_jobs';

registerTraceMindRoutes();

Meteor.startup(() => {
  startProductUsageInstrumentation();
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
