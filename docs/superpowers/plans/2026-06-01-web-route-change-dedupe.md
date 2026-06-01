# Web Route Change Dedupe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Web Auto Capture from emitting duplicate `route_change` events and duplicate presence boundaries when the normalized route path has not actually changed.

**Architecture:** Fix the source of the duplicate inside the Web `clientScript()` route hooks. Add route-only path normalization and compare the next route path with the last accepted route path before sending `route_change` or splitting presence. Keep raw/manual capture, server ingestion, semantic extraction, summary, and historical data unchanged.

**Tech Stack:** Meteor server module, generated Web JavaScript capture script, Node `vm`-based Meteor Mocha tests.

---

## Current Behavior

- `server/capture_routes.js` builds Web capture payload paths with `currentPath()` as `location.pathname + location.hash`.
- `pushState`, `replaceState`, `popstate`, and `hashchange` all send `route_change` without comparing the previous route to the next route.
- `captureRouteChange()` calls `stopPresence('end')` before the history callback runs, so even a no-op route update can split presence.
- The queue coalesces presence heartbeats only; it does not coalesce capture events.
- Server ingestion and semantic extraction persist each raw `route_change`, so reporting and MCP summaries see the duplicates later.

## Target Behavior

- Web Auto Capture emits a `route_change` only when the route-normalized path changes.
- Empty hash, bare `#`, and bare `#!` are normalized away for route-change comparison.
- Meaningful hash routes remain observable, including `#!/route`, `#section`, and any non-empty hash other than bare `#` or `#!`.
- Presence is stopped and restarted only when a route change is accepted for capture.
- `page_view`, manual `window.TraceMind.capture(...)`, app errors, feedback, and target action paths keep their existing `currentPath()` / `safeCapturePath()` semantics.
- No historical records are rewritten or hidden.

## Runtime And Surface Matrix

| Runtime / Surface | Status | Rule |
| --- | --- | --- |
| Web | changed | Add route-only normalization and dedupe in generated `capture.js`. |
| Hybrid WebView | changed | Inherits the Web script behavior. Native shell capture is unchanged. |
| iOS | unchanged | Native `setScreen` behavior is already separate and should not be touched. |
| macOS | unchanged | Native screen capture is unchanged. |
| Android | unchanged | Native screen capture is unchanged. |
| React Native | unchanged | Bridge/native screen capture is unchanged. |
| Mini Program | unchanged | Uses its own SDK and path normalization. |
| Browser Extension | unchanged | Uses its own extension SDK and path normalization. |
| server SDKs | unchanged | Manual business events are not route auto capture. |
| MCP | unchanged | Tool contracts stay the same; new data becomes cleaner. |
| Agent Skill | unchanged | Static skill guidance is not involved. |
| Dashboard/API | unchanged | No public response schema change. |

## Rules

1. Do not add server-side route dedupe as the main fix.
2. Do not change semantic extraction or summary counts for historical data in this task.
3. Do not suppress all hash routes. Only fold empty hash, `#`, and bare `#!`.
4. Do not stop/start presence before confirming the route-normalized path changed.
5. Do not change `currentPath()` globally; use a separate route-only helper so click/input/custom/app_error paths keep current semantics.
6. Do not add new public SDK options or configuration flags.
7. Keep the fix contained to `/Users/wolf3c/Project/TraceMind/server/capture_routes.js` and focused tests in `/Users/wolf3c/Project/TraceMind/tests/main.js`.
8. Use TDD: write the failing route-dedupe test first, confirm it fails, then implement the minimal code.
9. No SDK manifest update is required unless files under `/Users/wolf3c/Project/TraceMind/sdk/` are changed; this plan does not change SDK files.
10. Do not commit unless the user explicitly asks.

## File Structure

- Modify `/Users/wolf3c/Project/TraceMind/tests/main.js`
  - Add VM-based Web Auto Capture tests near the existing capture-script tests.
  - Cover no-op same path, bare hashbang, real path change, meaningful hash route, and presence boundaries.
- Modify `/Users/wolf3c/Project/TraceMind/server/capture_routes.js`
  - Add route-only normalization helper inside `clientScript()`.
  - Replace unconditional route event handlers with `sendRouteChangeIfChanged(...)`.

---

### Task 1: Add A Failing VM Test For Route Dedupe

**Files:**
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

- [ ] **Step 1: Insert the failing test after the reliable queue test**

Add this test after the existing `queues web capture records in localStorage and clears them after a successful flush` test:

```js
    it('deduplicates web route changes before splitting presence', async function () {
      const { Script, createContext } = await import('vm');
      const { clientScript } = await import('../server/capture_routes');
      const storage = new Map();
      const fetchCalls = [];
      const windowListeners = {};
      const timers = [];
      const locationState = {
        origin: 'https://app.example.com',
        href: 'https://app.example.com/app/rN9MLsx2THfXCEJ5d',
        pathname: '/app/rN9MLsx2THfXCEJ5d',
        hash: '',
      };
      function setLocation(value) {
        const url = new URL(value, locationState.origin);
        locationState.href = url.href;
        locationState.pathname = url.pathname || '/';
        locationState.hash = url.hash || '';
      }
      function runTimers() {
        while (timers.length) {
          const handler = timers.shift();
          handler();
        }
      }
      function flushedEvents(endpointSuffix) {
        return fetchCalls
          .filter((call) => call.endpoint.endsWith(endpointSuffix))
          .flatMap((call) => JSON.parse(call.body).events);
      }
      const sandbox = {
        window: {},
        document: {
          title: 'TraceMind route page',
          referrer: '',
          visibilityState: 'visible',
          currentScript: {
            getAttribute(name) {
              if (name === 'data-tracemind-token') return 'tm_proj_test';
              return null;
            },
          },
          addEventListener() {},
          hasFocus() { return true; },
        },
        navigator: {
          userAgent: 'test-agent',
          language: 'en',
          platform: 'test',
          onLine: true,
        },
        screen: { width: 1280, height: 720, colorDepth: 24 },
        location: locationState,
        history: {
          pushState(_state, _title, url) {
            if (url) setLocation(url);
          },
          replaceState(_state, _title, url) {
            if (url) setLocation(url);
          },
        },
        URL,
        Intl,
        Promise,
        Blob,
        Date,
        Math,
        JSON,
        Object,
        String,
        Array,
        Number,
        setTimeout(handler, delay) {
          if (delay === 0) timers.push(handler);
          return timers.length;
        },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        fetch(endpoint, options) {
          fetchCalls.push({ endpoint, body: options.body });
          return Promise.resolve({ ok: true, status: 202 });
        },
      };
      sandbox.window = {
        localStorage: {
          getItem(key) { return storage.has(key) ? storage.get(key) : null; },
          setItem(key, value) { storage.set(key, value); },
        },
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener(type, handler) {
          windowListeners[type] = handler;
        },
      };
      sandbox.localStorage = sandbox.window.localStorage;

      new Script(clientScript('https://tracemind.example.com')).runInContext(createContext(sandbox));
      await sandbox.window.TraceMind.flush();
      fetchCalls.length = 0;

      sandbox.history.replaceState({}, '', '/app/rN9MLsx2THfXCEJ5d');
      runTimers();
      setLocation('/app/rN9MLsx2THfXCEJ5d#!');
      windowListeners.hashchange();
      runTimers();
      await sandbox.window.TraceMind.flush();

      assert.strictEqual(flushedEvents('/api/capture').filter((event) => event.type === 'route_change').length, 0);
      assert.strictEqual(flushedEvents('/api/presence').length, 0);

      sandbox.history.pushState({}, '', '/app/another');
      runTimers();
      setLocation('/app/another#!/detail');
      windowListeners.hashchange();
      runTimers();
      await sandbox.window.TraceMind.flush();

      const routeChanges = flushedEvents('/api/capture').filter((event) => event.type === 'route_change');
      const presenceEvents = flushedEvents('/api/presence');
      assert.deepStrictEqual(routeChanges.map((event) => event.path), [
        '/app/another',
        '/app/another#!/detail',
      ]);
      assert.deepStrictEqual(presenceEvents.map((event) => event.state), [
        'end',
        'start',
        'end',
        'start',
      ]);
    });
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
TEST_GREP="deduplicates web route changes" meteor test --once --driver-package meteortesting:mocha --port 3127
```

Expected before implementation: FAIL because the current script queues a `route_change` and presence `end/start` for the same path or bare `#!` hashchange.

---

### Task 2: Implement Route-Only Normalization And Dedupe

**Files:**
- Modify: `/Users/wolf3c/Project/TraceMind/server/capture_routes.js`

- [ ] **Step 1: Add route-only helpers after `currentPath()`**

Insert this code immediately after the existing `currentPath()` function:

```js
  function routeCapturePath() {
    var pathname = location.pathname || '/';
    var hashValue = location.hash || '';
    if (hashValue === '#' || hashValue === '#!') hashValue = '';
    return pathname + hashValue;
  }

  var lastRoutePath = routeCapturePath();

  function sendRouteChangeIfChanged(nextPath) {
    if (!nextPath || nextPath === lastRoutePath) return false;
    lastRoutePath = nextPath;
    stopPresence('end');
    send('route_change', { path: nextPath });
    startPresence('start');
    return true;
  }
```

- [ ] **Step 2: Replace unconditional route handlers**

Replace the current route handling block:

```js
  function captureRouteChange(callback) {
    stopPresence('end');
    callback();
    setTimeout(function () {
      send('route_change');
      startPresence('start');
    }, 0);
  }

  var pushState = history.pushState;
  history.pushState = function () {
    var args = arguments;
    captureRouteChange(function () { pushState.apply(history, args); });
  };
  var replaceState = history.replaceState;
  history.replaceState = function () {
    var args = arguments;
    captureRouteChange(function () { replaceState.apply(history, args); });
  };
  window.addEventListener('popstate', function () {
    stopPresence('end');
    send('route_change');
    startPresence('start');
  });
  window.addEventListener('hashchange', function () {
    stopPresence('end');
    send('route_change');
    startPresence('start');
  });
```

with:

```js
  function captureRouteChange(callback) {
    callback();
    var nextPath = routeCapturePath();
    setTimeout(function () {
      sendRouteChangeIfChanged(nextPath);
    }, 0);
  }

  var pushState = history.pushState;
  history.pushState = function () {
    var args = arguments;
    captureRouteChange(function () { pushState.apply(history, args); });
  };
  var replaceState = history.replaceState;
  history.replaceState = function () {
    var args = arguments;
    captureRouteChange(function () { replaceState.apply(history, args); });
  };
  window.addEventListener('popstate', function () {
    sendRouteChangeIfChanged(routeCapturePath());
  });
  window.addEventListener('hashchange', function () {
    sendRouteChangeIfChanged(routeCapturePath());
  });
```

- [ ] **Step 3: Run the focused test**

Run:

```bash
TEST_GREP="deduplicates web route changes" meteor test --once --driver-package meteortesting:mocha --port 3127
```

Expected after implementation: PASS.

---

### Task 3: Update Existing Script-Shape Assertions

**Files:**
- Modify: `/Users/wolf3c/Project/TraceMind/tests/main.js`

- [ ] **Step 1: Extend the core SPA signal test**

In `serves Web Auto Capture with stable target identity and core SPA signals`, keep the existing assertions and add these route-specific checks near the existing history/hashchange assertions:

```js
      assert.ok(script.includes('function routeCapturePath()'));
      assert.ok(script.includes("if (hashValue === '#' || hashValue === '#!') hashValue = '';"));
      assert.ok(script.includes('function sendRouteChangeIfChanged(nextPath)'));
      assert.ok(script.includes('sendRouteChangeIfChanged(routeCapturePath())'));
```

- [ ] **Step 2: Run the focused script-shape test**

Run:

```bash
TEST_GREP="stable target identity and core SPA signals" meteor test --once --driver-package meteortesting:mocha --port 3127
```

Expected: PASS.

---

### Task 4: Run Relevant Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run focused Web Auto Capture tests**

Run:

```bash
TEST_GREP="Web Auto Capture|route changes|capture records" meteor test --once --driver-package meteortesting:mocha --port 3127
```

Expected: PASS. If Meteor rejects `TEST_GREP`, run the full suite instead of changing test names.

- [ ] **Step 2: Run full project tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Confirm no SDK runtime files changed**

Run:

```bash
git diff --name-only
```

Expected changed files for this task:

```text
server/capture_routes.js
tests/main.js
docs/superpowers/plans/2026-06-01-web-route-change-dedupe.md
```

If any file under `sdk/` changed, stop and run:

```bash
npm run update:sdk-manifest
npm run test:sdk-release
```

This should not be necessary for the planned Web-only script change.

---

## Risk Review

- Bare `#!` will no longer produce a `route_change`. This is intended because the observed reports show it behaves like a hash-only anchor/no-op in the affected flow.
- A customer using bare `#!` as a meaningful route would stop seeing that as a route boundary. The plan deliberately preserves `#!/route` to avoid breaking hash-router apps.
- The fix does not clean old duplicated raw or semantic records. Historical reports may still show the old duplicates.
- The fix does not change `summary.topActions`, `project_health`, MCP tools, or dashboard schemas.
- Rapid multiple history calls in one tick will capture each accepted path from the callback result rather than reading the final location repeatedly, reducing duplicate final-path captures.

## Suggested Commit Message

```text
Deduplicate Web route change captures
```
