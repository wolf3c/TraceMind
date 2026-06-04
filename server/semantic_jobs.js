import { Meteor } from 'meteor/meteor';
import { RawBehaviors, SemanticEvents } from '/imports/api/tracemind';
import { buildSemanticEvent } from '/imports/api/semantic';

const BATCH_SIZE = 100;
const INTERVAL_MS = 30 * 1000;
const PROCESSING_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

let extractionInProgress = false;

function claimedDocument(result) {
  if (!result) return null;
  if (Object.prototype.hasOwnProperty.call(result, 'value')) return result.value || null;
  return result;
}

async function claimNextRawBehavior(now = new Date()) {
  const staleBefore = new Date(now.getTime() - PROCESSING_LOCK_TIMEOUT_MS);
  const result = await RawBehaviors.rawCollection().findOneAndUpdate(
    {
      semanticStatus: 'pending',
      $or: [
        { semanticProcessingStartedAt: { $exists: false } },
        { semanticProcessingStartedAt: { $lte: staleBefore } },
      ],
    },
    {
      $set: {
        semanticProcessingStartedAt: now,
      },
    },
    {
      sort: { createdAt: 1 },
      returnDocument: 'after',
    },
  );
  return claimedDocument(result);
}

async function markRawBehaviorProcessed(behaviorId, semanticEventId) {
  await RawBehaviors.updateAsync(behaviorId, {
    $set: {
      semanticStatus: 'processed',
      semanticEventId,
      processedAt: new Date(),
    },
    $unset: {
      semanticProcessingStartedAt: '',
    },
  });
}

export async function extractSemanticEventsOnce() {
  if (extractionInProgress) return 0;
  extractionInProgress = true;

  try {
    let processedCount = 0;

    while (processedCount < BATCH_SIZE) {
      const behavior = await claimNextRawBehavior();
      if (!behavior) break;

      const existingEvent = await SemanticEvents.findOneAsync({ rawBehaviorId: behavior._id });
      if (existingEvent) {
        await markRawBehaviorProcessed(behavior._id, existingEvent._id);
        processedCount += 1;
        continue;
      }

      const eventId = await SemanticEvents.insertAsync(buildSemanticEvent(behavior));
      await markRawBehaviorProcessed(behavior._id, eventId);
      processedCount += 1;
    }

    return processedCount;
  } finally {
    extractionInProgress = false;
  }
}

export function startSemanticExtractionJob() {
  Meteor.setInterval(() => {
    extractSemanticEventsOnce().catch((error) => {
      console.error('[TraceMind] semantic extraction failed', error);
    });
  }, INTERVAL_MS);
}
