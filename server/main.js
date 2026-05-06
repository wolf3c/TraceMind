import { Meteor } from 'meteor/meteor';
import './tracemind_methods';
import { registerTraceMindRoutes } from './capture_routes';
import { startSemanticExtractionJob, extractSemanticEventsOnce } from './semantic_jobs';

registerTraceMindRoutes();

Meteor.startup(() => {
  startSemanticExtractionJob();
  extractSemanticEventsOnce().catch((error) => {
    console.error('[TraceMind] initial semantic extraction failed', error);
  });
});
