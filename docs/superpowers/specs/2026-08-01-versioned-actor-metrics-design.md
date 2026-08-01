# Versioned Actor Metrics Design

**Status:** Implemented locally; not deployed

**Date:** 2026-08-01

## Goal

Add a deterministic, additive actor-metrics contract that explains what the existing user counts contain without changing the meaning of `activeUsers`, `newUsers`, `sessionCount`, retention, trends, alerts, or the Dashboard.

The first phase answers only facts TraceMind can prove from existing payloads:

- which actors carry a stable `userId`;
- which actors are anonymous client actors;
- which actors are unscoped operational runtimes;
- which actors cannot be classified because their source is unknown;
- when one anonymous actor can be merged safely into one identified actor in the same reporting evidence;
- when an anonymous identity is ambiguous because it links to more than one user.

It does not claim that a canonical actor is a human or a new registration.

## Current Behavior

- Hourly and daily reports use `userId || anonymousId || deviceId || deviceFingerprint` as the actor ID.
- Login can therefore turn one person from an anonymous actor into a second identified actor.
- Server, MCP, and Agent Skill runtimes without a user ID can enter the same actor count.
- `newUsers` means an actor hash not seen in earlier daily reports, not a newly registered account.
- Historical reports and retention cohorts persist the version-1 actor sets.
- Dashboard, Meteor publication, and MCP project health consume the legacy fields directly.

## Target Contract

Every newly computed hourly report stores private, HMAC-only `actorEvidenceV2`. Its public `current` object exposes only aggregate `actorMetricsV2`:

```js
{
  version: 2,
  coverage: "complete", // complete | partial | unavailable
  observedActors: 8,
  canonicalUserActors: 5,
  identifiedActors: 3,
  anonymousActors: 2,
  operationalActors: 1,
  unclassifiedActors: 1,
  firstSeenCanonicalActors: null,
  identityMergeCount: 1,
  identityConflictCount: 1
}
```

`firstSeenCanonicalActors` is `null` for an hourly report and a number for a complete daily report.

Private evidence contains only `version`, `coverage`, four normalized HMAC category arrays, and HMAC alias pairs. It does not duplicate `observedActorKeys`; the report root's version-1 `activeActorKeys` remains the observed-actor source. It never contains raw `userId`, `anonymousId`, `deviceId`, `deviceFingerprint`, IP, URL, content, or credentials.

## Deterministic Classification

Source types are interpreted as follows:

- client: `web`, `ios`, `macos`, `android`, `mini_program`, `browser_extension`;
- operational: `server`, `server_app`, `mcp_server`, `agent_skill`;
- unknown: missing, `unknown`, or any unsupported value.

React Native uses its existing iOS/Android source type. Hybrid uses its existing Web/native source type and framework metadata; neither introduces a new source type.

An event or presence record with a non-empty `userId` contributes an identified actor regardless of source. A record without `userId` contributes:

- an anonymous actor for a client source;
- an operational actor for an operational source;
- an unclassified actor for an unknown source.

Normalization partitions the report's observed version-1 actor keys before safe alias removal. Identified wins when a key appears in the identified input. Otherwise, a key in exactly one non-identified input keeps that category; a key in zero or multiple non-identified inputs becomes unclassified. The resulting identified, client-anonymous, operational, and unclassified sets are mutually exclusive and exhaustive.

Identity linking uses only an `anonymousId` and `userId` carried together by an accepted event or presence record:

- one anonymous key linked to exactly one user key is safe to merge only when the keys differ, the anonymous key is an observed normalized client-anonymous actor, and the target is an identified actor;
- one anonymous key linked to multiple user keys is a conflict and is not merged;
- a self-alias is retained as HMAC evidence but never increments `identityMergeCount`; if the same anonymous key also targets another user, it remains a multi-target conflict;
- `deviceId`, fingerprint, IP, attribution, language, timezone, path, UA, and behavior are never alias keys.

`identityMergeCount` is the number of separately observed anonymous actor keys removed by safe canonicalization. `identityConflictCount` is the number of ambiguous anonymous keys.

## Hourly And Daily Aggregation

Hourly computation builds version-2 evidence alongside the unchanged version-1 sets.

Daily aggregation combines the four HMAC category sets and alias pairs across completed hours, uses each recognized hourly report's root `activeActorKeys` as its observed set, then canonicalizes once across the whole report window. Client-anonymous membership is materialized once as a `Set`, so alias canonicalization is linear rather than scanning an array per alias. This allows a login in a later hour to merge an earlier anonymous actor without a new identity collection.

Coverage rules are strict:

- `complete`: every included hourly report has complete version-2 evidence;
- `partial`: at least one but not all included hourly reports has complete version-2 evidence;
- `unavailable`: none has complete version-2 evidence, including when hours carry only the explicit unavailable fallback.

When coverage is not complete, all v2 aggregate counts except `version` and `coverage` are `null`. Counts must never fall back to summing incomplete hours.

For a complete daily report, a canonical group is first-seen only when none of its member version-1 actor keys appears in earlier daily `activeActorKeys`. Safe aliases join their identified target's canonical group. A unique anonymous alias that is not observed in the current window remains an alias-only historical member for this check, while an observed non-client alias does not join the group. This makes a previously seen anonymous actor that identifies today returning rather than newly created without treating unsafe current aliases as merges.

## Compatibility

- Keep root `actorSetVersion: 1`, `activeActorKeys`, `newActorKeys`, and all legacy public metrics unchanged.
- Add `actorEvidenceV2` and `current.actorMetricsV2`; no database migration is required.
- Do not backfill automatically. Old and mixed reports return `partial` or `unavailable` rather than fabricated values.
- MCP health synthesizes the explicit null-valued unavailable v2 object for old stored daily reports. Raw legacy Meteor publication documents may omit the additive field; consumers interpret absence as unavailable.
- Do not add v2 retention, trends, or attention rules in this phase.
- Do not change Dashboard labels or rendering in this phase.
- Do not add a collection, index, SDK field, capture-script field, dependency, or customer instrumentation requirement.

## Public And Privacy Boundary

Meteor publication and MCP project health may expose `current.actorMetricsV2` because it contains aggregate counts only. They must not expose `actorEvidenceV2`, actor keys, alias pairs, or conflict keys.

The v2 computation is report observability. Failure to build or summarize v2 evidence must not change capture ingestion or legacy report generation. Hourly and daily writes preflight the complete candidate with a 12 MiB UTF-8 JSON estimate. An oversized candidate stores the same complete v1 report with empty unavailable v2 evidence and null-valued unavailable public metrics. If a complete candidate still receives a Mongo/BSON document-too-large error, the writer retries once with that fallback; unrelated database failures remain visible.

## Cross-Runtime Impact Matrix

| Runtime / Surface | Phase 1 |
| --- | --- |
| Web | server-side metric interpretation changes; SDK unchanged |
| iOS | server-side metric interpretation changes; SDK unchanged |
| macOS | server-side metric interpretation changes; SDK unchanged |
| Android | server-side metric interpretation changes; SDK unchanged |
| React Native | uses iOS/Android source type; bridge unchanged |
| Hybrid | uses Web/native source type; SDK and framework metadata unchanged |
| Mini Program | server-side metric interpretation changes; SDK unchanged |
| Browser Extension | server-side metric interpretation changes; SDK unchanged |
| server Node/Python/HTTP | no-user actor becomes operational; SDK unchanged |
| MCP Node/Python | no-user actor becomes operational; SDK unchanged |
| Agent Skill | no-user actor becomes operational; runtime unchanged |
| Dashboard | no visible change |
| Meteor publication | additive aggregate field only |
| MCP `project_health` | additive aggregate field only |
| Hourly/daily reports | additive private evidence and public aggregates |
| Docs/tests | update |

## Verification Strategy

Use red-green TDD for:

1. deterministic source classification and identity canonicalization;
2. cross-hour alias merging and strict coverage gating;
3. daily first-seen canonical actor semantics while v1 stays unchanged;
4. public aggregate projection without private-key leakage;
5. historical absence projection, mutually exclusive partition/self-alias behavior, compact evidence, moderate-cardinality deterministic canonicalization, and storage-budget/BSON fallback while preserving v1.

Required final checks:

- focused Meteor tests for every red-green cycle;
- `git diff --check`;
- `npm test`;
- `npx svelte-check` is not required because no Svelte file changes;
- SDK manifest commands are not required because no `sdk/` file changes;
- agent-owned diff review that preserves the existing unrelated documentation edits.

## Success Criteria

- One anonymous actor followed by one identified actor can become one canonical actor without changing v1 counts.
- Ambiguous anonymous-to-multiple-user links are never merged.
- Unscoped operational runtimes are separated from user actors.
- Mixed old/new hourly reports never produce apparently complete v2 counts.
- Old finalized MCP reports expose explicit unavailable metrics while raw legacy publication absence is interpreted as unavailable.
- Persisted private evidence does not duplicate observed actor keys, and oversized or v2-failing reports preserve every v1 field.
- A returning anonymous actor that identifies today is not labeled first-seen by v2.
- Public responses contain only aggregate v2 values.
- All legacy metrics, trends, retention, alerts, SDKs, and visible Dashboard behavior remain unchanged.

## Out Of Scope

- Human or bot probability scoring.
- Known-bot UA lists, IP/ASN reputation, webdriver collection, or probe-path filtering.
- Visit/session lifecycle changes or 30-minute visit counting.
- Registration-completion events or AI分身术 changes.
- V2 retention, trends, alerts, or UI switching.
- Permanent identity graphs or cross-project identity joins.
- Historical destructive backfill, deployment, release, or feedback-status updates.
