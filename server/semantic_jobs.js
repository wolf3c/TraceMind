import { Meteor } from 'meteor/meteor';
import { RawBehaviors, SemanticEvents } from '/imports/api/tracemind';
import { buildSemanticEvent } from '/imports/api/semantic';

const BATCH_SIZE = 100;
const INTERVAL_MS = 30 * 1000;

export async function extractSemanticEventsOnce() {
  const rawBehaviors = await RawBehaviors.find(
    { semanticStatus: 'pending' },
    { sort: { createdAt: 1 }, limit: BATCH_SIZE },
  ).fetchAsync();

  for (const behavior of rawBehaviors) {
    const event = buildSemanticEvent(behavior);
    await SemanticEvents.insertAsync(event);
    await RawBehaviors.updateAsync(behavior._id, {
      $set: {
        semanticStatus: 'processed',
        semanticEventId: event._id,
        processedAt: new Date(),
      },
    });
  }

  return rawBehaviors.length;
}

export function startSemanticExtractionJob() {
  Meteor.setInterval(() => {
    extractSemanticEventsOnce().catch((error) => {
      console.error('[TraceMind] semantic extraction failed', error);
    });
  }, INTERVAL_MS);
}
