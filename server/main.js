import { Meteor } from 'meteor/meteor';
import { Socket } from 'node:net';
import { installSocketErrorDiagnostics } from '../imports/api/socket_error_diagnostics';
import './oauth_accounts';
import './tracemind_methods';
import './tracemind_publications';
import { registerTraceMindRoutes, startProductUsageInstrumentation } from './capture_routes';
import { ensureTraceMindIndexes, startDailyReportJob, startHourlyDraftReportJob, computeFinalReportsForYesterday } from './daily_reports';
import { startSemanticExtractionJob, extractSemanticEventsOnce } from './semantic_jobs';
import { startIngestionGuardJobs } from './ingestion_guard';

installSocketErrorDiagnostics({ SocketClass: Socket });
registerTraceMindRoutes();

Meteor.startup(() => {
  startProductUsageInstrumentation();
  ensureTraceMindIndexes().catch((error) => {
    console.error('[TraceMind] index initialization failed', error);
  });
  startSemanticExtractionJob();
  startIngestionGuardJobs();
  startDailyReportJob();
  startHourlyDraftReportJob();
  extractSemanticEventsOnce().catch((error) => {
    console.error('[TraceMind] initial semantic extraction failed', error);
  });
  computeFinalReportsForYesterday().catch((error) => {
    console.error('[TraceMind] initial daily report finalization failed', error);
  });
});
