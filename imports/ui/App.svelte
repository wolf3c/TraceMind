<script>
  import { Accounts } from "meteor/accounts-base";
  import { Meteor } from "meteor/meteor";
  import { Tracker } from "meteor/tracker";
  import { untrack } from "svelte";
  import { get } from "svelte/store";
  import { buildAgentInstallPrompt } from "./agent_setup";
  import { resolveConsoleState } from "./console_state";
  import { locale, locales, t } from "./i18n/i18n";
  import {
    resolveInitialProjectSummaryState,
    resolveSelectedProjectId,
    shouldApplyProjectSummaryResponse,
  } from "./project_console_state";

  const currentOrigin = () => (typeof location === "undefined" ? "" : location.origin);
  const translateNow = (key, vars) => get(t)(key, vars);
  const localeLabels = {
    en: "English",
    zh: "Chinese",
  };
  const setupDocsUrl = "https://github.com/wolf3c/TraceMind#1-%E5%88%86%E9%92%9F%E6%8E%A5%E5%85%A5";
  const newProjectOption = "__new_project__";

  let email = $state("");
  let code = $state("");
  let projectName = $state("");
  let renameProjectName = $state("");
  let mcpTokenName = $state("");
  let selectedLocale = $state("en");
  let userId = $state(Meteor.userId());
  let loggingIn = $state(!Meteor.userId() || Meteor.loggingIn());
  let dashboard = $state(null);
  let dashboardLoading = $state(false);
  let dashboardLoadError = $state("");
  let dashboardRequestId = $state(0);
  let status = $state("");
  let copiedTarget = $state("");
  let loading = $state(false);
  let selectedProjectId = $state("");
  let showProjectCreate = $state(false);
  let showProjectActions = $state(false);
  let showProjectRename = $state(false);
  let selectedProjectSummary = $state(null);
  let projectSummaryLoading = $state(false);
  let projectSummaryError = $state("");
  let projectSummaryRequestId = $state(0);
  let projectSummaryLastLoadedAt = $state(null);
  let refreshAgeTick = $state(Date.now());
  let dashboardLoadPromise = null;
  let copiedTargetTimer = null;

  let consoleState = $derived(resolveConsoleState({
    dashboard,
    userId,
    loggingIn,
    dashboardLoadError,
  }));
  let primaryProject = $derived(
    dashboard?.projects?.find((project) => project._id === selectedProjectId) || dashboard?.projects?.[0],
  );
  let primaryMcpToken = $derived(primaryProject?.mcpTokens?.[0]);
  let sourceSummary = $derived(selectedProjectSummary?.sources || []);
  let summary = $derived(selectedProjectSummary?.summary);
  let health = $derived(selectedProjectSummary?.health);
  let healthCurrent = $derived(health?.current || {});
  let delivery = $derived(selectedProjectSummary?.delivery || {});
  let deliveryDropped = $derived(Number(delivery.droppedOldest || 0) + Number(delivery.droppedStorage || 0));
  let displayedRecentEvents = $derived((selectedProjectSummary?.recentEvents || []).slice(0, 15));
  let hiddenRecentEventCount = $derived(Math.max(0, (selectedProjectSummary?.recentEvents || []).length - displayedRecentEvents.length));
  let projectSummaryRefreshAge = $derived(formatRefreshAge(projectSummaryLastLoadedAt, refreshAgeTick, selectedLocale));
  let topEventType = $derived(summary?.topEvents?.[0]?.eventType || "none");
  let topPath = $derived(summary?.topPaths?.[0]?.path || "/");
  let mcpUrl = $derived(primaryMcpToken ? `${currentOrigin()}/mcp?mcpToken=${primaryMcpToken.token}` : "");
  let agentSkillUrl = $derived(`${currentOrigin()}/agents/tracemind/SKILL.md`);
  let agentSnippetUrl = $derived(`${currentOrigin()}/agents/tracemind/AGENTS_SNIPPET.md`);
  let agentManifestUrl = $derived(`${currentOrigin()}/agents/tracemind/manifest.json`);
  let agentInstallPrompt = $derived(
    mcpUrl
      ? buildAgentInstallPrompt({
        locale: selectedLocale,
        origin: currentOrigin(),
        mcpUrl,
        projectId: primaryProject._id,
        projectName: primaryProject.name,
        skillUrl: agentSkillUrl,
        snippetUrl: agentSnippetUrl,
        manifestUrl: agentManifestUrl,
      })
      : "",
  );

  function callMethod(name, ...args) {
    return new Promise((resolve, reject) => {
      Meteor.call(name, ...args, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  function errorMessage(error) {
    const messages = {
      "invalid-email": "Enter a valid email address.",
      "invalid-code": "The verification code is invalid or expired.",
      "not-authorized": "Log in first.",
      "not-found": "Project not found.",
    };
    const reason = error.reason || error.message || "";

    if (reason.includes("Expired token")) return translateNow("The verification code expired. Request a new one.");
    if (reason.includes("token mismatch") || reason.includes("Email or token mismatch")) {
      return translateNow("The verification code is incorrect. Check the email and try again.");
    }

    return messages[error.error] ? translateNow(messages[error.error]) : reason;
  }

  function syncSelectedProject(nextDashboard) {
    const projects = nextDashboard?.projects || [];
    const nextSelectedProjectId = resolveSelectedProjectId(projects, selectedProjectId);
    if (!nextSelectedProjectId) {
      selectedProjectId = "";
      ({ selectedProjectSummary, projectSummaryLoading, projectSummaryError } = resolveInitialProjectSummaryState());
      projectSummaryLastLoadedAt = null;
    } else if (nextSelectedProjectId !== selectedProjectId) {
      selectedProjectId = nextSelectedProjectId;
      projectSummaryLastLoadedAt = null;
    }
  }

  async function loadProjectSummary(projectId = selectedProjectId) {
    const requestUserId = Meteor.userId();
    if (!requestUserId || !projectId) {
      selectedProjectSummary = null;
      projectSummaryLastLoadedAt = null;
      return null;
    }

    const requestId = projectSummaryRequestId + 1;
    projectSummaryRequestId = requestId;
    projectSummaryLoading = true;
    projectSummaryError = "";

    try {
      const nextSummary = await callMethod("tracemind.project.summary", projectId);
      if (!shouldApplyProjectSummaryResponse({
        requestId,
        activeRequestId: projectSummaryRequestId,
        requestUserId,
        currentUserId: Meteor.userId(),
        projectId,
        selectedProjectId,
      })) {
        return null;
      }
      selectedProjectSummary = nextSummary;
      projectSummaryLastLoadedAt = new Date();
      refreshAgeTick = Date.now();
      if (nextSummary?.project) replaceProject(nextSummary.project);
      return nextSummary;
    } catch (error) {
      if (shouldApplyProjectSummaryResponse({
        requestId,
        activeRequestId: projectSummaryRequestId,
        requestUserId,
        currentUserId: Meteor.userId(),
        projectId,
        selectedProjectId,
      })) {
        projectSummaryError = errorMessage(error);
      }
      throw error;
    } finally {
      if (shouldApplyProjectSummaryResponse({
        requestId,
        activeRequestId: projectSummaryRequestId,
        requestUserId,
        currentUserId: Meteor.userId(),
        projectId,
        selectedProjectId,
      })) {
        projectSummaryLoading = false;
      }
    }
  }

  function requestLoginToken(options) {
    return new Promise((resolve, reject) => {
      Accounts.requestLoginTokenForUser(options, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  function passwordlessLogin(selector, token) {
    return new Promise((resolve, reject) => {
      Meteor.passwordlessLoginWithToken(selector, token, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async function requestCode() {
    loading = true;
    status = "";
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await requestLoginToken({
        selector: { email: normalizedEmail },
        userData: { email: normalizedEmail },
      });
      status = translateNow("Verification code sent. Check your inbox or use the login link in the email.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function verifyCode() {
    loading = true;
    status = "";
    try {
      await passwordlessLogin({ email: email.trim().toLowerCase() }, code.trim());
      await loadDashboard();
      status = translateNow("Logged in.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function loadDashboard({ loadProjectSummary: shouldLoadProjectSummary = true } = {}) {
    const requestUserId = Meteor.userId();
    if (!requestUserId) return null;
    if (dashboardLoadPromise) return dashboardLoadPromise;

    const requestId = dashboardRequestId + 1;
    dashboardRequestId = requestId;
    dashboardLoading = true;
    dashboardLoadError = "";

    const loadPromise = callMethod("tracemind.dashboard")
      .then((nextDashboard) => {
        if (requestId !== dashboardRequestId || requestUserId !== Meteor.userId()) return null;
        syncSelectedProject(nextDashboard);
        dashboard = nextDashboard;
        if (shouldLoadProjectSummary && selectedProjectId) {
          loadProjectSummary(selectedProjectId).catch(() => {});
        }
        return nextDashboard;
      })
      .catch((error) => {
        if (requestId === dashboardRequestId && requestUserId === Meteor.userId()) {
          dashboardLoadError = errorMessage(error);
        }
        throw error;
      })
      .finally(() => {
        if (dashboardLoadPromise === loadPromise) {
          dashboardLoadPromise = null;
        }
        if (requestId === dashboardRequestId && requestUserId === Meteor.userId()) {
          dashboardLoading = false;
        }
      });

    dashboardLoadPromise = loadPromise;
    return loadPromise;
  }

  async function retryDashboard() {
    status = "";
    try {
      await loadDashboard();
    } catch (error) {
      if (dashboard) {
        status = errorMessage(error);
      }
    }
  }

  async function retryProjectSummary() {
    status = "";
    try {
      await loadProjectSummary();
    } catch (error) {
      status = errorMessage(error);
    }
  }

  function changeSelectedProject(event) {
    const nextProjectId = event?.currentTarget?.value || "";
    if (nextProjectId === newProjectOption) {
      showProjectCreate = true;
      showProjectActions = false;
      showProjectRename = false;
      event.currentTarget.value = selectedProjectId;
      return;
    }

    selectedProjectId = nextProjectId;
    selectedProjectSummary = null;
    projectSummaryLastLoadedAt = null;
    showProjectCreate = false;
    showProjectActions = false;
    showProjectRename = false;
    loadProjectSummary().catch(() => {});
  }

  function toggleProjectActions() {
    showProjectActions = !showProjectActions;
    if (!showProjectActions) showProjectRename = false;
  }

  function startProjectRename() {
    if (!primaryProject) return;
    renameProjectName = primaryProject.name;
    showProjectRename = true;
    showProjectActions = false;
  }

  function cancelProjectCreate() {
    showProjectCreate = false;
    projectName = "";
  }

  function cancelProjectRename() {
    showProjectRename = false;
    renameProjectName = "";
  }

  async function createProject() {
    const name = projectName.trim();
    if (!name) return;

    loading = true;
    status = "";
    try {
      const createdProject = await callMethod("tracemind.project.create", name);
      selectedProjectId = createdProject._id;
      projectName = "";
      showProjectCreate = false;
      showProjectActions = false;
      showProjectRename = false;
      await loadDashboard({ loadProjectSummary: false });
      await loadProjectSummary(createdProject._id);
      status = translateNow("Project created and selected.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function renameProject() {
    if (!primaryProject) return;
    const name = renameProjectName.trim();
    if (!name) return;

    loading = true;
    status = "";
    try {
      const updatedProject = await callMethod("tracemind.project.rename", primaryProject._id, name);
      replaceProject(updatedProject);
      showProjectRename = false;
      renameProjectName = "";
      status = translateNow("Project name updated.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function removeProject() {
    if (!primaryProject) return;
    if (!window.confirm(translateNow("Delete project {{project}}? This permanently deletes its project key, MCP tokens, raw behaviors, and semantic events.", { project: primaryProject.name }))) return;

    const removedProjectId = primaryProject._id;
    loading = true;
    status = "";
    try {
      await callMethod("tracemind.project.remove", removedProjectId);
      selectedProjectSummary = null;
      projectSummaryRequestId += 1;
      projectSummaryLoading = false;
      projectSummaryError = "";
      projectSummaryLastLoadedAt = null;
      selectedProjectId = "";
      showProjectActions = false;
      showProjectRename = false;
      showProjectCreate = false;
      await loadDashboard();
      status = translateNow("Project deleted.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  function replaceProject(updatedProject) {
    if (!dashboard) return;
    dashboard = {
      ...dashboard,
      projects: dashboard.projects.map((project) => (
        project._id === updatedProject._id ? updatedProject : project
      )),
    };
  }

  async function createMcpToken() {
    if (!primaryProject) return;

    loading = true;
    status = "";
    try {
      const updatedProject = await callMethod(
        "tracemind.project.mcpToken.create",
        primaryProject._id,
        mcpTokenName.trim() || "MCP Token",
      );
      mcpTokenName = "";
      replaceProject(updatedProject);
      status = translateNow("MCP token created.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function renameMcpToken(token) {
    if (!primaryProject || !token) return;

    loading = true;
    status = "";
    try {
      const updatedProject = await callMethod(
        "tracemind.project.mcpToken.rename",
        primaryProject._id,
        token.id,
        token.name,
      );
      replaceProject(updatedProject);
      status = translateNow("MCP token name updated.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function refreshMcpToken(token) {
    if (!primaryProject || !token) return;
    if (!window.confirm(translateNow("Refreshing this MCP token immediately invalidates the old token. Continue?"))) return;

    loading = true;
    status = "";
    try {
      const updatedProject = await callMethod(
        "tracemind.project.mcpToken.refresh",
        primaryProject._id,
        token.id,
      );
      replaceProject(updatedProject);
      status = translateNow("MCP token refreshed. The old token is invalid.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function removeMcpToken(token) {
    if (!primaryProject || !token) return;
    if (!window.confirm(translateNow("Deleting this MCP token immediately invalidates it. Continue?"))) return;

    loading = true;
    status = "";
    try {
      const updatedProject = await callMethod(
        "tracemind.project.mcpToken.remove",
        primaryProject._id,
        token.id,
      );
      replaceProject(updatedProject);
      status = translateNow("MCP token deleted.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function copyAgentInstallPrompt() {
    await copyText("agent-install-prompt", agentInstallPrompt, "Agent install prompt copied.");
  }

  async function copyText(target, value, message) {
    if (!value || !navigator?.clipboard) {
      status = translateNow("Clipboard is unavailable in this browser.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      copiedTarget = target;
      status = translateNow(message);
      if (copiedTargetTimer) window.clearTimeout(copiedTargetTimer);
      copiedTargetTimer = window.setTimeout(() => {
        copiedTarget = "";
        copiedTargetTimer = null;
      }, 1800);
    } catch (error) {
      status = errorMessage(error);
    }
  }

  async function blockSource(source) {
    if (!primaryProject || !source) return;
    const sourceName = source.sourceLabel || source.sourceKey;
    if (!window.confirm(translateNow("Block source {{source}}? New events from it will be silently rejected.", { source: sourceName }))) return;

    loading = true;
    status = "";
    try {
      await callMethod("tracemind.project.source.block", primaryProject._id, {
        sourceType: source.sourceType,
        sourceKey: source.sourceKey,
        sourceLabel: source.sourceLabel,
        reason: "Blocked from console",
      });
      await loadDashboard();
      status = translateNow("Source blocked. Future events from it will not enter the database.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function unblockSource(source) {
    if (!primaryProject || !source) return;

    loading = true;
    status = "";
    try {
      await callMethod("tracemind.project.source.unblock", primaryProject._id, {
        sourceType: source.sourceType,
        sourceKey: source.sourceKey,
      });
      await loadDashboard();
      status = translateNow("Source unblocked.");
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  function logout() {
    dashboardRequestId += 1;
    dashboardLoadPromise = null;
    dashboardLoading = false;
    dashboardLoadError = "";
    projectSummaryRequestId += 1;
    projectSummaryLoading = false;
    projectSummaryError = "";
    selectedProjectSummary = null;
    projectSummaryLastLoadedAt = null;
    selectedProjectId = "";
    showProjectCreate = false;
    showProjectActions = false;
    showProjectRename = false;
    userId = null;
    loggingIn = false;
    dashboard = null;
    Meteor.logout(() => {
      userId = null;
      dashboard = null;
    });
  }

  function changeLocale() {
    locale.set(selectedLocale);
  }

  function formatDate(value) {
    if (!value) return translateNow("Unknown");
    return new Date(value).toLocaleString(selectedLocale === "zh" ? "zh-CN" : "en-US");
  }

  function compactDate(value) {
    if (!value) return translateNow("Unknown");
    return new Date(value).toLocaleString(selectedLocale === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDuration(value) {
    const totalSeconds = Math.max(0, Math.round(Number(value || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function formatRefreshAge(value, nowValue = Date.now(), localeValue = selectedLocale) {
    if (!value) return translateNow("Not refreshed yet");
    const elapsedMs = Math.max(0, Number(nowValue) - new Date(value).getTime());
    const elapsedMinutes = Math.floor(elapsedMs / 60000);

    if (elapsedMinutes < 1) return translateNow("Last refreshed just now");
    if (elapsedMinutes < 60) {
      return translateNow("Last refreshed {{count}} min ago", { count: elapsedMinutes });
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    return translateNow("Last refreshed {{count}} hr ago", { count: elapsedHours });
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString(selectedLocale === "zh" ? "zh-CN" : "en-US");
  }

  function formatDecimal(value) {
    return Number(value || 0).toLocaleString(selectedLocale === "zh" ? "zh-CN" : "en-US", {
      maximumFractionDigits: 1,
    });
  }

  function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return translateNow("No sample");
    return `${Math.round(Number(value) * 100)}%`;
  }

  function formatRatePercent(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return translateNow("No sample");
    return `${(Number(value) * 100).toLocaleString(selectedLocale === "zh" ? "zh-CN" : "en-US", {
      maximumFractionDigits: 1,
    })}%`;
  }

  function formatTrend(value) {
    const numericValue = Number(value || 0);
    if (!numericValue) return translateNow("Flat vs previous 24h");
    const direction = numericValue > 0 ? "↑" : "↓";
    return `${direction} ${Math.round(Math.abs(numericValue) * 100)}% ${translateNow("vs previous 24h")}`;
  }

  function trendClass(value) {
    const numericValue = Number(value || 0);
    if (numericValue > 0) return "trend-positive";
    if (numericValue < 0) return "trend-negative";
    return "trend-flat";
  }

  function retentionText(retention) {
    if (!retention || !retention.sampleSize) return translateNow("No sample");
    return `${formatPercent(retention.rate)} · ${retention.retainedUsers}/${retention.sampleSize}`;
  }

  function topCountText(item) {
    if (!item) return translateNow("No data");
    return `${item.label || item.path || translateNow("Unknown")} · ${formatNumber(item.count)}`;
  }

  function topItemLabel(item) {
    return item?.label || item?.path || translateNow("Unknown");
  }

  function bouncePageMetricText(item) {
    return `${formatRatePercent(item?.bounceRate)} · ${formatNumber(item?.bounces)}/${formatNumber(item?.sessions)} · ${formatDuration(item?.averageBounceDurationMs)} ${translateNow("avg")}`;
  }

  function eventSourceLabel(event) {
    return event?.sourceLabel || event?.sourceKey || event?.platform || translateNow("Unknown source");
  }

  function eventActorLabel(event) {
    return event?.userId || event?.anonymousId || event?.deviceId || event?.deviceFingerprint || translateNow("Anonymous user");
  }

  function copiedLabel(target) {
    return copiedTarget === target ? translateNow("Copied") : translateNow("Copy");
  }

  $effect(() => locale.subscribe((value) => {
    selectedLocale = value;
  }));

  $effect(() => {
    const computation = Tracker.autorun(() => {
      untrack(() => {
        const nextUserId = Meteor.userId();
        const nextLoggingIn = Meteor.loggingIn();
        userId = nextUserId;
        loggingIn = nextLoggingIn;

        if (nextUserId && window.TraceMind) {
          window.TraceMind.identify(nextUserId);
        }

        if (!nextUserId) {
          if (!nextLoggingIn) {
            dashboardRequestId += 1;
            dashboardLoadPromise = null;
            dashboardLoading = false;
            dashboardLoadError = "";
            projectSummaryRequestId += 1;
            projectSummaryLoading = false;
            projectSummaryError = "";
            selectedProjectSummary = null;
            projectSummaryLastLoadedAt = null;
            selectedProjectId = "";
            showProjectCreate = false;
            showProjectActions = false;
            showProjectRename = false;
            dashboard = null;
          }
          return;
        }

        if (!dashboard && !dashboardLoading && !dashboardLoadError) {
          loadDashboard().catch(() => {});
        }
      });
    });

    return () => computation.stop();
  });

  $effect(() => {
    const timer = window.setInterval(() => {
      refreshAgeTick = Date.now();
    }, 30000);

    return () => window.clearInterval(timer);
  });
</script>

<main class="shell">
  <section class="hero">
    <nav class="nav">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="15" fill="#FFFDF8"/>
          <path d="M17 43V21h7.5L32 35l7.5-14H47v22" fill="none" stroke="#0F2F2A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M19 47c8-6 18-6 27 0" fill="none" stroke="#18A77A" stroke-width="4.5" stroke-linecap="round"/>
          <circle cx="47" cy="47" r="3.6" fill="#F2B84B"/>
        </svg>
        <span>TraceMind</span>
      </div>
      <div class="nav-actions">
        <label class="language-label" for="locale-select">
          <span class="sr-only">{$t("Language")}</span>
          <select id="locale-select" bind:value={selectedLocale} onchange={changeLocale}>
            {#each locales as localeCode (localeCode)}
              <option value={localeCode}>{$t(localeLabels[localeCode] || localeCode)}</option>
            {/each}
          </select>
        </label>
        {#if userId}
          <button class="ghost" type="button" onclick={logout}>{$t("Log out")}</button>
        {/if}
      </div>
    </nav>

    <div class="hero-grid">
      <div class="hero-copy">
        <h1>{$t("See how users actually use your product with one line of code.")}</h1>
        <p class="lede">{$t("TraceMind turns real user behavior into product signals you can analyze. With remote MCP, you can ask Codex, Claude Code, or Cursor about drop-off, feature usage, and conversion issues directly.")}</p>
        <div class="hero-actions">
          <a href="#console" class="button">{$t("Start setup")}</a>
          <a href={setupDocsUrl} class="button secondary" target="_blank" rel="noreferrer">{$t("Open docs")}</a>
        </div>
      </div>

      <div class="signal-panel card-panel" aria-label="TraceMind data flow">
        <div class="signal-panel-header">
          <span class="tm-badge tm-badge-signal">{$t("Live behavior stream")}</span>
          <span class="tm-badge tm-badge-amber">{$t("Remote MCP ready")}</span>
          <code>tm_proj_xxx</code>
        </div>

        <div class="signal-metrics">
          <div>
            <span>{$t("Raw events")}</span>
            <strong>1,248</strong>
          </div>
          <div>
            <span>{$t("Semantic events")}</span>
            <strong>317</strong>
          </div>
          <div>
            <span>{$t("Agent queries")}</span>
            <strong>42</strong>
          </div>
        </div>

        <div class="event-stream">
          <div>
            <span>{$t("Raw behavior")}</span>
            <strong>{$t("POST /api/capture")}</strong>
            <small>{$t("click, page_view, submit")}</small>
          </div>
          <div>
            <span>{$t("Semantic understanding")}</span>
            <strong>{$t("semantic_event.created")}</strong>
            <small>{$t("Viewed pricing page, submitted signup form")}</small>
          </div>
          <div>
            <span>{$t("AI agent access")}</span>
            <strong>{$t("mcp.tools.call")}</strong>
            <small>{$t("Codex, Claude Code, and Cursor read semantic events through MCP")}</small>
          </div>
        </div>

        <div class="agent-query">
          <span>{$t("Codex asks")}</span>
          <strong>{$t("Why did users reach pricing but not submit?")}</strong>
          <p>{$t("TraceMind returns key paths, user distribution, device sources, and reviewable behavior evidence.")}</p>
        </div>
      </div>
    </div>
  </section>

  <section id="how" class="workflow">
    <div>
      <p class="section-label">{$t("Two core capabilities")}</p>
      <h2>{$t("Turn real user behavior into AI-readable product data with one line of code.")}</h2>
    </div>
    <div class="one-line-example">
      <div>
        <span>{$t("Setup example")}</span>
        <strong>{$t("Put this script into your web product page")}</strong>
      </div>
      <code>&lt;script src="{currentOrigin()}/capture.js" data-tracemind-token="tm_proj_xxx" async&gt;&lt;/script&gt;</code>
    </div>
    <div class="feature-grid">
      <article>
        <span class="tm-badge tm-badge-signal">{$t("One script")}</span>
        <h3>{$t("Auto capture")}</h3>
        <p>{$t("Copy one script to automatically record page views, clicks, inputs, form submits, and path changes.")}</p>
      </article>
      <article>
        <span class="tm-badge tm-badge-amber">{$t("AI-driven")}</span>
        <h3>{$t("AI analysis and instrumentation")}</h3>
        <p>{$t("TraceMind turns raw behavior into semantic events and exposes read-only MCP evidence so Codex, Claude Code, or Cursor can analyze product usage directly.")}</p>
      </article>
    </div>
  </section>

  <section id="console" class="console">
    <div class="console-header">
      <span class="tm-badge tm-badge-muted">{$t("Developer console")}</span>
      <h2>{$t("Capture real user behavior after login.")}</h2>
    </div>

    {#if consoleState === "signed-out"}
      <div class="auth-panel card-panel">
        <label class="field-label">
          <span>{$t("Email")}</span>
          <input id="email" name="email" bind:value={email} type="email" placeholder={$t("you@example.com")} autocomplete="email" />
        </label>
        <div class="auth-actions">
          <button type="button" onclick={requestCode} disabled={loading}>{$t("Send code")}</button>
        </div>
        <label class="field-label">
          <span>{$t("Verification code")}</span>
          <input id="login-code" name="code" bind:value={code} inputmode="numeric" placeholder={$t("123456")} />
        </label>
        <button type="button" onclick={verifyCode} disabled={loading}>{$t("Log in")}</button>
      </div>
    {:else if consoleState === "restoring-session"}
      <div class="console-state-panel card-panel" role="status" aria-live="polite">
        <span class="tm-badge tm-badge-signal">{$t("Developer console")}</span>
        <strong>{$t("Checking your session...")}</strong>
      </div>
    {:else if consoleState === "loading-dashboard"}
      <div class="console-state-panel card-panel" role="status" aria-live="polite">
        <span class="tm-badge tm-badge-signal">{$t("Developer console")}</span>
        <strong>{$t("Loading your console...")}</strong>
      </div>
    {:else if consoleState === "dashboard-error"}
      <div class="console-state-panel card-panel" role="alert">
        <span class="tm-badge tm-badge-amber">{$t("Developer console")}</span>
        <strong>{$t("Could not load your console.")}</strong>
        <p>{dashboardLoadError}</p>
        <div class="console-state-actions">
          <button type="button" onclick={retryDashboard} disabled={dashboardLoading}>
            {dashboardLoading ? $t("Loading your console...") : $t("Retry")}
          </button>
          <button class="ghost" type="button" onclick={logout}>{$t("Log out")}</button>
        </div>
      </div>
    {:else}
      <div class="dashboard-grid">
        <div class="account-panel card-panel">
          <span class="tm-badge tm-badge-signal">{$t("Current account")}</span>
          <strong>{dashboard.developer.email}</strong>
          <p>
            {$t("{{projects}} projects.", {
              projects: dashboard.projects.length,
            })}
          </p>
        </div>

        <div class="setup-panel card-panel">
          {#if primaryProject}
            <div class="project-console-header">
              <div class="project-title">
                <span>{$t("Current project")}</span>
                <strong>{primaryProject.name}</strong>
              </div>
              <div class="project-console-signals" aria-label="Current project signal summary">
                <span>{topEventType}</span>
                <span>{topPath}</span>
              </div>
            </div>
            <div class="project-toolbar">
              <label class="field-label project-selector" for="selected-project">
                <span>{$t("Switch project")}</span>
                <select id="selected-project" name="selectedProject" value={selectedProjectId} onchange={changeSelectedProject}>
                  {#each dashboard.projects as project}
                    <option value={project._id}>{project.name}</option>
                  {/each}
                  <option value={newProjectOption}>{$t("New project")}</option>
                </select>
              </label>
              <div class="project-action-menu">
                <button class="ghost project-more-button" type="button" onclick={toggleProjectActions} aria-expanded={showProjectActions} aria-label={$t("Project actions")}>
                  ⋯
                </button>
                {#if showProjectActions}
                  <div class="project-action-popover">
                    <button class="ghost" type="button" onclick={startProjectRename} disabled={loading}>
                      {$t("Rename project")}
                    </button>
                    <button class="ghost danger" type="button" onclick={removeProject} disabled={loading}>
                      {$t("Delete project")}
                    </button>
                  </div>
                {/if}
              </div>
            </div>
            {#if showProjectCreate}
              <div class="project-create-row">
                <input id="project-name" name="projectName" bind:value={projectName} placeholder={$t("Production Web App")} />
                <button type="button" onclick={createProject} disabled={loading || !projectName.trim()}>
                  {$t("Create")}
                </button>
                <button class="ghost" type="button" onclick={cancelProjectCreate} disabled={loading}>
                  {$t("Cancel")}
                </button>
              </div>
            {/if}
            {#if showProjectRename}
              <div class="project-create-row">
                <input id="project-rename" name="projectRename" bind:value={renameProjectName} placeholder={$t("Project name")} />
                <button type="button" onclick={renameProject} disabled={loading || !renameProjectName.trim()}>
                  {$t("Save")}
                </button>
                <button class="ghost" type="button" onclick={cancelProjectRename} disabled={loading}>
                  {$t("Cancel")}
                </button>
              </div>
            {/if}
            <label class="field-label">
              <span>{$t("Project key")}</span>
              <div class="field-copy-group">
                <input id="project-key" name="projectKey" readonly value={primaryProject.projectKey} />
                <button class:copied={copiedTarget === "project-key"} class="ghost compact-copy" type="button" onclick={() => copyText("project-key", primaryProject.projectKey, "Project key copied.")}>
                  {copiedLabel("project-key")}
                </button>
              </div>
            </label>
            <div class="agent-setup-panel">
              <div class="agent-setup-header">
                <div>
                  <span>{$t("Coding Agent Setup")}</span>
                  <strong>{$t("Copy the install prompt and send it to your coding agent.")}</strong>
                </div>
                <button class:copied={copiedTarget === "agent-install-prompt"} class="ghost" type="button" onclick={copyAgentInstallPrompt} disabled={!agentInstallPrompt}>
                  {copiedTarget === "agent-install-prompt" ? $t("Copied install prompt") : $t("Copy install prompt")}
                </button>
              </div>
              {#if !agentInstallPrompt}
                <p class="empty">{$t("Create an MCP token before generating the coding agent setup prompt.")}</p>
              {/if}
            </div>

            <details class="disclosure-panel">
              <summary>
                <span>{$t("Manage MCP tokens")}</span>
              </summary>
              <div class="mcp-token-panel">
                <div class="mcp-token-header">
                  <div>
                    <span>{$t("MCP Tokens")}</span>
                    <strong>{$t("Assign independent read-only credentials to members or agents")}</strong>
                  </div>
                  <div class="mcp-token-create">
                    <input id="mcp-token-name" name="mcpTokenName" bind:value={mcpTokenName} placeholder={$t("Cursor / Claude / teammate")} />
                    <button type="button" onclick={createMcpToken} disabled={loading}>{$t("Add")}</button>
                  </div>
                </div>
                {#if primaryProject.mcpTokens.length}
                  <div class="mcp-token-list">
                    {#each primaryProject.mcpTokens as token (token.id)}
                      <div class="mcp-token-row">
                        <label class="field-label">
                          <span>{$t("Name")}</span>
                          <input id={`mcp-token-name-${token._id}`} name={`mcpTokenName-${token._id}`} bind:value={token.name} />
                        </label>
                        <label class="field-label">
                          <span>{$t("Token")}</span>
                          <input id={`mcp-token-value-${token._id}`} name={`mcpTokenValue-${token._id}`} readonly value={token.token} />
                        </label>
                        <div class="mcp-url-copy">
                          <span>{$t("MCP URL")}</span>
                          <button class:copied={copiedTarget === `mcp-url-${token.id}`} class="ghost compact-copy" type="button" onclick={() => copyText(`mcp-url-${token.id}`, `${currentOrigin()}/mcp?mcpToken=${token.token}`, "MCP URL copied.")}>
                            {copiedLabel(`mcp-url-${token.id}`)}
                          </button>
                        </div>
                        <div class="mcp-token-actions">
                          <button class="ghost" type="button" onclick={() => renameMcpToken(token)} disabled={loading}>
                            {$t("Save name")}
                          </button>
                          <button class="ghost" type="button" onclick={() => refreshMcpToken(token)} disabled={loading}>
                            {$t("Refresh")}
                          </button>
                          <button class="ghost danger" type="button" onclick={() => removeMcpToken(token)} disabled={loading}>
                            {$t("Delete")}
                          </button>
                        </div>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="empty">{$t("This project has no MCP token. Add one so AI agents can read semantic events with read-only access.")}</p>
                {/if}
              </div>
            </details>

            <details class="disclosure-panel source-disclosure">
              <summary>
                <span>{$t("Source statistics")}</span>
              </summary>
              <div class="source-panel">
                <p class="disclosure-description">{$t("See recent sources writing to this project key")}</p>
                {#if sourceSummary.length}
                  <div class="source-list">
                    {#each sourceSummary as source (`${source.sourceType}:${source.sourceKey}`)}
                      <div class:blocked={source.blocked} class="source-row">
                        <div>
                          <strong>{source.sourceLabel || source.sourceKey}</strong>
                          <span>{source.sourceType} / {source.sourceKey}</span>
                        </div>
                        <div>
                          <span>{$t("Events")}</span>
                          <strong>{source.count}</strong>
                        </div>
                        <div>
                          <span>{$t("Last seen")}</span>
                          <strong>{formatDate(source.lastSeenAt)}</strong>
                        </div>
                        {#if source.blocked}
                          <button class="ghost" type="button" onclick={() => unblockSource(source)} disabled={loading}>
                            {$t("Unblock")}
                          </button>
                        {:else}
                          <button class="ghost danger" type="button" onclick={() => blockSource(source)} disabled={loading}>
                            {$t("Block")}
                          </button>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="empty">{$t("No source data yet. Source statistics will appear after events are captured.")}</p>
                {/if}
              </div>
            </details>

          {/if}
        </div>
      </div>

      <div class="events card-panel">
        <div class="events-header">
          <div>
            <div class="health-title-row">
              <span>{$t("Project health overview")}</span>
              <strong class={`health-status ${health?.status === "needs_attention" ? "needs-attention" : ""}`}>
                {health?.status === "needs_attention" ? $t("Needs attention") : $t("Normal")}
              </strong>
            </div>
            <h3>{primaryProject?.name || $t("Project")}</h3>
            <p>{$t("Last 24 hours compared with previous 24 hours.")}</p>
            {#if health?.attentionSummary}
              <p class="health-attention">{$t("Needs attention")}: {health.attentionSummary}</p>
            {/if}
          </div>
          <div class="refresh-control">
            <span class="refresh-age">{projectSummaryRefreshAge}</span>
            <button class="ghost" type="button" onclick={retryProjectSummary} disabled={projectSummaryLoading || !primaryProject}>
              {projectSummaryLoading ? $t("Loading project events...") : $t("Refresh")}
            </button>
          </div>
        </div>
        <div class="event-metrics health-metrics" aria-label="Current project health summary">
          <details class="health-card">
            <summary>
              <span>{$t("Active users")}</span>
              <strong>{formatNumber(healthCurrent.activeUsers)}</strong>
              <small class={trendClass(health?.trends?.activeUsers)}>{formatTrend(health?.trends?.activeUsers)}</small>
              <em>{formatNumber(healthCurrent.newUsers)} {$t("new users")}</em>
            </summary>
            <dl class="health-detail-list">
              <div><dt>{$t("New users")}</dt><dd>{formatNumber(healthCurrent.newUsers)}</dd></div>
              <div><dt>{$t("D2 retention")}</dt><dd>{retentionText(healthCurrent.retention?.d2)}</dd></div>
              <div><dt>{$t("D3 retention")}</dt><dd>{retentionText(healthCurrent.retention?.d3)}</dd></div>
              <div><dt>{$t("D7 retention")}</dt><dd>{retentionText(healthCurrent.retention?.d7)}</dd></div>
              <div><dt>{$t("D30 retention")}</dt><dd>{retentionText(healthCurrent.retention?.d30)}</dd></div>
              <div><dt>{$t("User regions")}</dt><dd>{topCountText(healthCurrent.userRegions?.[0])}</dd></div>
              <div><dt>{$t("User devices")}</dt><dd>{topCountText(healthCurrent.deviceDistribution?.[0])}</dd></div>
            </dl>
          </details>
          <details class="health-card">
            <summary>
              <span>{$t("Active sessions")}</span>
              <strong>{formatNumber(healthCurrent.sessionCount)}</strong>
              <small class={trendClass(health?.trends?.sessions)}>{formatTrend(health?.trends?.sessions)}</small>
              <em>{formatDecimal(healthCurrent.averageSessionEvents)} {$t("events/session")}</em>
            </summary>
            <dl class="health-detail-list">
              <div><dt>{$t("Session sources")}</dt><dd>{topCountText(healthCurrent.sessionSources?.[0])}</dd></div>
              <div><dt>{$t("Session pages")}</dt><dd>{healthCurrent.sessionPaths?.[0] ? `${healthCurrent.sessionPaths[0].path} · ${formatNumber(healthCurrent.sessionPaths[0].count)}` : $t("No data")}</dd></div>
              <div><dt>{$t("Average session events")}</dt><dd>{formatDecimal(healthCurrent.averageSessionEvents)}</dd></div>
            </dl>
          </details>
          <details class="health-card">
            <summary>
              <span>{$t("Average active time per user")}</span>
              <strong>{formatDuration(healthCurrent.averageActiveDurationMs)}</strong>
              <small class={trendClass(health?.trends?.averageActiveDuration)}>{formatTrend(health?.trends?.averageActiveDuration)}</small>
              <em>{$t("foreground/focus + 60s interaction")}</em>
            </summary>
            <dl class="health-detail-list">
              <div><dt>{$t("Average active time per user")}</dt><dd>{formatDuration(healthCurrent.averageActiveDurationMs)}</dd></div>
              <div class="health-detail-row-stacked">
                <dt>{$t("Longest users Top 3")}</dt>
                <dd>
                  {#if healthCurrent.topDurationUsers?.length}
                    <ol class="health-top-list" aria-label={$t("Longest users Top 3")}>
                      {#each healthCurrent.topDurationUsers as item, index (`duration-user-${index}-${topItemLabel(item)}-${item.durationMs}`)}
                        <li class="health-top-item">
                          <span class="health-top-rank">{index + 1}</span>
                          <span class="health-top-label">{topItemLabel(item)}</span>
                          <strong>{formatDuration(item.durationMs)}</strong>
                        </li>
                      {/each}
                    </ol>
                  {:else}
                    {$t("No data")}
                  {/if}
                </dd>
              </div>
              <div class="health-detail-row-stacked">
                <dt>{$t("Longest pages Top 3")}</dt>
                <dd>
                  {#if healthCurrent.topDurationPaths?.length}
                    <ol class="health-top-list" aria-label={$t("Longest pages Top 3")}>
                      {#each healthCurrent.topDurationPaths as item, index (`duration-path-${index}-${topItemLabel(item)}-${item.durationMs}`)}
                        <li class="health-top-item">
                          <span class="health-top-rank">{index + 1}</span>
                          <span class="health-top-label">{topItemLabel(item)}</span>
                          <strong>{formatDuration(item.durationMs)}</strong>
                        </li>
                      {/each}
                    </ol>
                  {:else}
                    {$t("No data")}
                  {/if}
                </dd>
              </div>
              <div class="health-detail-row-stacked">
                <dt>{$t("Bounce pages Top 3")}</dt>
                <dd>
                  {#if healthCurrent.topBouncePages?.length}
                    <ol class="health-top-list" aria-label={$t("Bounce pages Top 3")}>
                      {#each healthCurrent.topBouncePages as item, index (`bounce-page-${index}-${topItemLabel(item)}-${item.bounces}-${item.sessions}`)}
                        <li class="health-top-item">
                          <span class="health-top-rank">{index + 1}</span>
                          <span class="health-top-label">{topItemLabel(item)}</span>
                          <strong class="health-top-metric">{bouncePageMetricText(item)}</strong>
                        </li>
                      {/each}
                    </ol>
                  {:else}
                    {$t("No data")}
                  {/if}
                </dd>
              </div>
              <div class="health-detail-row-stacked">
                <dt>{$t("Top events Top 3")}</dt>
                <dd>
                  {#if healthCurrent.topEvents?.length}
                    <ol class="health-top-list" aria-label={$t("Top events Top 3")}>
                      {#each healthCurrent.topEvents as item, index (`event-${index}-${topItemLabel(item)}-${item.count}`)}
                        <li class="health-top-item">
                          <span class="health-top-rank">{index + 1}</span>
                          <span class="health-top-label">{topItemLabel(item)}</span>
                          <strong>{formatNumber(item.count)}</strong>
                        </li>
                      {/each}
                    </ol>
                  {:else}
                    {$t("No data")}
                  {/if}
                </dd>
              </div>
            </dl>
          </details>
          <details class="health-card">
            <summary>
              <span>{$t("Total events")}</span>
              <strong>{formatNumber(healthCurrent.eventCount)}</strong>
              <small class={trendClass(health?.trends?.events)}>{formatTrend(health?.trends?.events)}</small>
              <em>{$t("user behavior events in 24h")}</em>
            </summary>
            <dl class="health-detail-list">
              <div class="health-detail-row-stacked">
                <dt>{$t("Top events Top 3")}</dt>
                <dd>
                  {#if healthCurrent.topEvents?.length}
                    <ol class="health-top-list" aria-label={$t("Top events Top 3")}>
                      {#each healthCurrent.topEvents as item, index (`event-${index}-${topItemLabel(item)}-${item.count}`)}
                        <li class="health-top-item">
                          <span class="health-top-rank">{index + 1}</span>
                          <span class="health-top-label">{topItemLabel(item)}</span>
                          <strong>{formatNumber(item.count)}</strong>
                        </li>
                      {/each}
                    </ol>
                  {:else}
                    {$t("No data")}
                  {/if}
                </dd>
              </div>
              <div><dt>{$t("Needs attention")}</dt><dd>{health?.attentionItems?.map((item) => item.message).join(" / ") || $t("No attention items")}</dd></div>
            </dl>
          </details>
          <details class="health-card">
            <summary>
              <span>{$t("Delivery health")}</span>
              <strong>{formatNumber(deliveryDropped)}</strong>
              <small class={delivery.failedFlushes ? "trend-negative" : "trend-flat"}>
                {delivery.failedFlushes ? `${formatNumber(delivery.failedFlushes)} ${$t("failed flushes")}` : $t("No failed flushes")}
              </small>
              <em>{$t("dropped queue records")}</em>
            </summary>
            <dl class="health-detail-list">
              <div><dt>{$t("Accepted uploads")}</dt><dd>{formatNumber(delivery.accepted)}</dd></div>
              <div><dt>{$t("Ignored uploads")}</dt><dd>{formatNumber(delivery.ignored)}</dd></div>
              <div><dt>{$t("Retry count")}</dt><dd>{formatNumber(delivery.retryCount)}</dd></div>
              <div><dt>{$t("Coalesced presence")}</dt><dd>{formatNumber(delivery.coalescedPresence)}</dd></div>
              <div><dt>{$t("Max queue depth")}</dt><dd>{formatNumber(delivery.maxQueueDepth)}</dd></div>
              <div><dt>{$t("Last successful flush")}</dt><dd>{delivery.lastSuccessfulFlushAt ? compactDate(delivery.lastSuccessfulFlushAt) : $t("No data")}</dd></div>
            </dl>
          </details>
        </div>
        {#if projectSummaryError}
          <div class="inline-error" role="alert">
            <strong>{$t("Could not load current project events.")}</strong>
            <span>{projectSummaryError}</span>
          </div>
        {:else if projectSummaryLoading && !selectedProjectSummary}
          <p class="empty">{$t("Loading project events...")}</p>
        {:else if displayedRecentEvents.length}
          <div class="event-stream-header">
            <div class="event-stream-title">
              <span>{$t("Detailed event stream")}</span>
              <p>{$t("Recent behavior evidence from the selected project. Showing the latest {{count}} rows.", {
                count: displayedRecentEvents.length,
              })}</p>
            </div>
            <div class="event-stream-total" aria-label={$t("Past 24 hours")}>
              <span>{$t("Past 24 hours")}</span>
              <strong>{$t("{{count}} events", {
                count: formatNumber(healthCurrent.eventCount),
              })}</strong>
            </div>
          </div>
          <div class="event-list" role="list">
            {#each displayedRecentEvents as event (event._id)}
              <article class="event-row" role="listitem">
                <div class="event-row-main">
                  <div class="event-row-title">
                    <strong>{event.title}</strong>
                  </div>
                  <p>{event.meaning}</p>
                </div>
                <div class="event-row-meta">
                  <span>{compactDate(event.occurredAt)}</span>
                  <span>{eventSourceLabel(event)}</span>
                  <span>{eventActorLabel(event)}</span>
                </div>
              </article>
            {/each}
          </div>
          {#if hiddenRecentEventCount}
            <p class="event-list-note">{$t("Showing the latest {{shown}} events. {{hidden}} older events are hidden in this console view.", {
              shown: displayedRecentEvents.length,
              hidden: hiddenRecentEventCount,
            })}</p>
          {/if}
        {:else}
          <p class="empty">{$t("No current project events yet. Add the script to this project, generate behavior, then refresh.")}</p>
        {/if}
      </div>
    {/if}

    {#if status}
      <p class="status-alert">{status}</p>
    {/if}
  </section>
</main>
