<script>
  import { Accounts } from "meteor/accounts-base";
  import { Meteor } from "meteor/meteor";
  import { Tracker } from "meteor/tracker";
  import { untrack } from "svelte";
  import { get } from "svelte/store";
  import packageInfo from "../../package.json";
  import {
    ProjectDailyReports,
    summarizeProjectHealthFromDailyReports,
  } from "../api/tracemind";
  import AuthPanel from "./AuthPanel.svelte";
  import { buildAgentInstallPrompt } from "./agent_setup";
  import ConsoleStatePanel from "./ConsoleStatePanel.svelte";
  import { resolveConsoleState } from "./console_state";
  import EventStreamPanel from "./EventStreamPanel.svelte";
  import IntroSections from "./IntroSections.svelte";
  import { locale, locales, t } from "./i18n/i18n";
  import ProjectHealthPanel from "./ProjectHealthPanel.svelte";
  import ProjectSetupPanel from "./ProjectSetupPanel.svelte";
  import {
    mergeProjectIntoDashboard,
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
  const appVersion = packageInfo.version || "dev";
  const reportTimezoneOffsetMs = 8 * 60 * 60 * 1000;
  const eventStreamPageSize = 20;

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
  let showActiveTimeTip = $state(false);
  let selectedProjectSummary = $state(null);
  let projectSummaryLoading = $state(false);
  let projectSummaryError = $state("");
  let projectSummaryRequestId = $state(0);
  let projectSummaryLastLoadedAt = $state(null);
  let showEventStream = $state(false);
  let eventStreamEvents = $state([]);
  let eventStreamLoading = $state(false);
  let eventStreamError = $state("");
  let eventStreamNextOffset = $state(0);
  let eventStreamHasMore = $state(true);
  let eventStreamRequestId = $state(0);
  let selectedReportDate = $state(reportDateForDate());
  let dailyReportsReady = $state(false);
  let publishedDailyReport = $state(null);
  let publishedProjectHealth = $state(null);
  let refreshAgeTick = $state(Date.now());
  let showIntro = $state(false);
  let dashboardLoadPromise = null;
  let copiedTargetTimer = null;

  let consoleState = $derived(resolveConsoleState({
    dashboard,
    userId,
    loggingIn,
    dashboardLoadError,
  }));
  let shouldShowIntro = $derived(consoleState === "signed-out" || showIntro);
  let primaryProject = $derived(
    dashboard?.projects?.find((project) => project._id === selectedProjectId) || dashboard?.projects?.[0],
  );
  let primaryMcpToken = $derived(primaryProject?.mcpTokens?.[0]);
  let sourceSummary = $derived(selectedProjectSummary?.sources || []);
  let summary = $derived(summaryFromHealth(publishedProjectHealth || selectedMethodProjectHealth()) || selectedProjectSummary?.summary);
  let health = $derived(publishedProjectHealth || selectedMethodProjectHealth());
  let healthCurrent = $derived(health?.current || {});
  let delivery = $derived(publishedDailyReport?.delivery || (
    selectedProjectSummary?.summaryWindow?.reportDate === selectedReportDate ? selectedProjectSummary?.delivery : {}
  ));
  let deliveryDropped = $derived(Number(delivery.droppedOldest || 0) + Number(delivery.droppedStorage || 0));
  let displayedRecentEvents = $derived(eventStreamEvents);
  let projectSummaryRefreshAge = $derived(formatRefreshAge(reportLoadedAt(), refreshAgeTick, selectedLocale));
  let todayReportDate = $derived(reportDateForDate(refreshAgeTick));
  let yesterdayReportDate = $derived(addReportDays(todayReportDate, -1));
  let dayBeforeReportDate = $derived(addReportDays(todayReportDate, -2));
  let topEventType = $derived(healthCurrent?.topEvents?.[0]?.label || summary?.topEvents?.[0]?.eventType || "none");
  let topPath = $derived(healthCurrent?.sessionPaths?.[0]?.path || summary?.topPaths?.[0]?.path || "/");
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

  function requestDailyReportRefresh(projectId = selectedProjectId, reportDate = selectedReportDate) {
    if (!Meteor.userId() || !projectId || !reportDate) return;
    callMethod("tracemind.project.dailyReports.refresh", projectId, reportDate).catch(() => {});
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

  function reportDateForDate(value = Date.now()) {
    const time = value instanceof Date ? value.getTime() : Number(value || Date.now());
    return new Date(time + reportTimezoneOffsetMs).toISOString().slice(0, 10);
  }

  function addReportDays(reportDate, days) {
    const [year, month, day] = String(reportDate || reportDateForDate()).split("-").map(Number);
    const startMs = Date.UTC(year, month - 1, day) - reportTimezoneOffsetMs;
    return reportDateForDate(startMs + days * 24 * 60 * 60 * 1000);
  }

  function reportDatesForSubscription(reportDate = selectedReportDate) {
    return [...new Set([
      todayReportDate,
      yesterdayReportDate,
      dayBeforeReportDate,
      reportDate,
      addReportDays(reportDate, -1),
    ].filter(Boolean))];
  }

  function selectedMethodProjectHealth() {
    return selectedProjectSummary?.summaryWindow?.reportDate === selectedReportDate
      ? selectedProjectSummary?.health
      : null;
  }

  function summaryFromHealth(projectHealth) {
    const current = projectHealth?.current;
    if (!current) return null;
    return {
      totalEvents: Number(current.eventCount || 0),
      uniqueUsers: Number(current.activeUsers || 0),
      uniqueDevices: (current.deviceDistribution || []).length,
      dailyActiveUsers: [],
      topEvents: (current.topEvents || []).map((item) => ({
        eventType: item.label,
        count: item.count,
      })),
      topPaths: (current.sessionPaths || []).map((item) => ({
        path: item.path,
        count: item.count,
      })),
    };
  }

  function reportLoadedAt() {
    return publishedDailyReport?.computedAt
      ? new Date(publishedDailyReport.computedAt)
      : projectSummaryLastLoadedAt;
  }

  function resetEventStream({ collapse = true } = {}) {
    eventStreamRequestId += 1;
    if (collapse) showEventStream = false;
    eventStreamEvents = [];
    eventStreamLoading = false;
    eventStreamError = "";
    eventStreamNextOffset = 0;
    eventStreamHasMore = true;
  }

  function syncSelectedProject(nextDashboard) {
    const projects = nextDashboard?.projects || [];
    const nextSelectedProjectId = resolveSelectedProjectId(projects, selectedProjectId);
    if (!nextSelectedProjectId) {
      selectedProjectId = "";
      ({ selectedProjectSummary, projectSummaryLoading, projectSummaryError } = resolveInitialProjectSummaryState());
      projectSummaryLastLoadedAt = null;
      resetEventStream();
    } else if (nextSelectedProjectId !== selectedProjectId) {
      selectedProjectId = nextSelectedProjectId;
      projectSummaryLastLoadedAt = null;
      resetEventStream();
    }
  }

  async function loadProjectSummary(projectId = selectedProjectId, reportDate = selectedReportDate) {
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
      const nextSummary = await callMethod("tracemind.project.summary", projectId, reportDate);
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
      if (reportDate !== selectedReportDate) return null;
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

  async function loadProjectEvents({ reset = false } = {}) {
    const requestUserId = Meteor.userId();
    const projectId = selectedProjectId;
    const reportDate = selectedReportDate;
    if (!requestUserId || !projectId || !reportDate) return null;

    const requestId = eventStreamRequestId + 1;
    eventStreamRequestId = requestId;
    eventStreamLoading = true;
    eventStreamError = "";
    const offset = reset ? 0 : eventStreamNextOffset;
    if (reset) {
      eventStreamEvents = [];
      eventStreamNextOffset = 0;
      eventStreamHasMore = true;
    }

    try {
      const result = await callMethod("tracemind.project.events", projectId, reportDate, {
        offset,
        limit: eventStreamPageSize,
      });
      if (
        requestId !== eventStreamRequestId
        || requestUserId !== Meteor.userId()
        || projectId !== selectedProjectId
        || reportDate !== selectedReportDate
      ) {
        return null;
      }
      eventStreamEvents = reset
        ? result.events || []
        : [...eventStreamEvents, ...(result.events || [])];
      eventStreamNextOffset = result.nextOffset || eventStreamEvents.length;
      eventStreamHasMore = Boolean(result.hasMore);
      return result;
    } catch (error) {
      if (
        requestId === eventStreamRequestId
        && requestUserId === Meteor.userId()
        && projectId === selectedProjectId
        && reportDate === selectedReportDate
      ) {
        eventStreamError = errorMessage(error);
      }
      throw error;
    } finally {
      if (
        requestId === eventStreamRequestId
        && requestUserId === Meteor.userId()
        && projectId === selectedProjectId
        && reportDate === selectedReportDate
      ) {
        eventStreamLoading = false;
      }
    }
  }

  function openEventStream() {
    showEventStream = true;
    if (!eventStreamEvents.length && eventStreamHasMore && !eventStreamLoading) {
      loadProjectEvents({ reset: true }).catch(() => {});
    }
  }

  function loadMoreEvents() {
    if (!eventStreamHasMore || eventStreamLoading) return;
    loadProjectEvents().catch(() => {});
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
        const selectedProject = dashboard?.projects?.find((project) => project._id === selectedProjectId);
        const nextProjects = nextDashboard?.projects || [];
        const resolvedDashboard = selectedProject && !nextProjects.some((project) => project._id === selectedProjectId)
          ? mergeProjectIntoDashboard(nextDashboard, selectedProject)
          : nextDashboard;
        syncSelectedProject(resolvedDashboard);
        dashboard = resolvedDashboard;
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
    resetEventStream();
    try {
      requestDailyReportRefresh();
      await loadProjectSummary();
    } catch (error) {
      status = errorMessage(error);
    }
  }

  function selectReportDate(reportDate) {
    if (!reportDate || reportDate === selectedReportDate) return;
    selectedReportDate = reportDate;
    resetEventStream();
    requestDailyReportRefresh(selectedProjectId, reportDate);
  }

  function changeReportDate(event) {
    selectReportDate(event?.currentTarget?.value || todayReportDate);
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
    resetEventStream();
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

  function toggleActiveTimeTip(event) {
    event.preventDefault();
    event.stopPropagation();
    showActiveTimeTip = !showActiveTimeTip;
  }

  async function createProject() {
    const name = projectName.trim();
    if (!name) return;

    loading = true;
    status = "";
    try {
      const createdProject = await callMethod("tracemind.project.create", name);
      dashboard = mergeProjectIntoDashboard(dashboard, createdProject);
      selectedProjectId = createdProject._id;
      resetEventStream();
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
      resetEventStream();
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
    dashboard = mergeProjectIntoDashboard(dashboard, updatedProject);
  }

  function updateMcpTokenName(tokenId, name) {
    if (!primaryProject) return;
    replaceProject({
      ...primaryProject,
      mcpTokens: primaryProject.mcpTokens.map((token) => (
        token.id === tokenId ? { ...token, name } : token
      )),
    });
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
    resetEventStream();
    showProjectCreate = false;
    showProjectActions = false;
    showProjectRename = false;
    userId = null;
    loggingIn = false;
    showIntro = false;
    dashboard = null;
    Meteor.logout(() => {
      userId = null;
      dashboard = null;
    });
  }

  function changeLocale() {
    locale.set(selectedLocale);
  }

  function toggleIntro() {
    showIntro = !showIntro;
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
    if (!numericValue) return translateNow("Flat vs previous day");
    const direction = numericValue > 0 ? "↑" : "↓";
    return `${direction} ${Math.round(Math.abs(numericValue) * 100)}% ${translateNow("vs previous day")}`;
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
    const requestUserId = userId;
    const projectId = selectedProjectId;
    const reportDate = selectedReportDate;
    const reportDates = reportDatesForSubscription(reportDate);

    if (!requestUserId || !projectId || !reportDates.length) {
      dailyReportsReady = false;
      publishedDailyReport = null;
      publishedProjectHealth = null;
      return;
    }

    requestDailyReportRefresh(projectId, reportDate);

    const computation = Tracker.autorun(() => {
      const handle = Meteor.subscribe("tracemind.project.dailyReports", projectId, reportDates);
      const currentReport = ProjectDailyReports.findOne({ projectId, reportDate });
      const previousReport = ProjectDailyReports.findOne({ projectId, reportDate: addReportDays(reportDate, -1) });
      const nextHealth = currentReport || previousReport
        ? summarizeProjectHealthFromDailyReports({
          currentReport,
          previousReport,
          retention: currentReport?.current?.retention,
        })
        : null;

      untrack(() => {
        dailyReportsReady = handle.ready();
        publishedDailyReport = currentReport || null;
        publishedProjectHealth = nextHealth;
      });
    });

    return () => computation.stop();
  });

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
            dailyReportsReady = false;
            publishedDailyReport = null;
            publishedProjectHealth = null;
            selectedProjectId = "";
            resetEventStream();
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
  <IntroSections
    {shouldShowIntro}
    {userId}
    {showIntro}
    bind:selectedLocale
    {locales}
    {localeLabels}
    {setupDocsUrl}
    {toggleIntro}
    {changeLocale}
    {logout}
  />
  <section id="console" class="console">
    <div class="console-header">
      <span class="tm-badge tm-badge-muted">{$t("Developer console")}</span>
      <h2>{$t("Capture real user behavior after login")}</h2>
    </div>

    {#if consoleState === "signed-out"}
      <AuthPanel
        bind:email
        bind:code
        {loading}
        {requestCode}
        {verifyCode}
      />
    {:else if consoleState === "restoring-session" || consoleState === "loading-dashboard" || consoleState === "dashboard-error"}
      <ConsoleStatePanel
        state={consoleState}
        {dashboardLoadError}
        {dashboardLoading}
        {retryDashboard}
        {logout}
      />
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

        <ProjectSetupPanel
          {primaryProject}
          {dashboard}
          {selectedProjectId}
          {newProjectOption}
          {loading}
          bind:projectName
          bind:renameProjectName
          bind:mcpTokenName
          {showProjectCreate}
          {showProjectActions}
          {showProjectRename}
          {copiedTarget}
          {agentInstallPrompt}
          {sourceSummary}
          {topEventType}
          {topPath}
          {currentOrigin}
          {copiedLabel}
          {changeSelectedProject}
          {toggleProjectActions}
          {startProjectRename}
          {removeProject}
          {createProject}
          {cancelProjectCreate}
          {renameProject}
          {cancelProjectRename}
          {copyText}
          {copyAgentInstallPrompt}
          {createMcpToken}
          {renameMcpToken}
          {refreshMcpToken}
          {removeMcpToken}
          {updateMcpTokenName}
          {formatDate}
          {blockSource}
          {unblockSource}
        />
      </div>

      <div class="events card-panel">
        <ProjectHealthPanel
          {primaryProject}
          {health}
          {healthCurrent}
          {delivery}
          {deliveryDropped}
          {selectedReportDate}
          {todayReportDate}
          {yesterdayReportDate}
          {dayBeforeReportDate}
          {projectSummaryRefreshAge}
          {projectSummaryLoading}
          {showActiveTimeTip}
          {selectReportDate}
          {changeReportDate}
          {retryProjectSummary}
          {toggleActiveTimeTip}
          {formatNumber}
          {formatDecimal}
          {formatDuration}
          {compactDate}
          {formatTrend}
          {trendClass}
          {retentionText}
          {topCountText}
          {topItemLabel}
          {bouncePageMetricText}
        />
        <EventStreamPanel
          {primaryProject}
          {healthCurrent}
          {projectSummaryError}
          {projectSummaryLoading}
          {selectedProjectSummary}
          {showEventStream}
          {eventStreamError}
          {eventStreamLoading}
          {eventStreamHasMore}
          {displayedRecentEvents}
          {openEventStream}
          {loadMoreEvents}
          {formatNumber}
          {compactDate}
          {eventSourceLabel}
          {eventActorLabel}
        />
      </div>
    {/if}

    {#if status}
      <p class="status-alert" role="status" aria-live="polite">{status}</p>
    {/if}
  </section>

  <footer class="app-version" aria-label="TraceMind version">
    TraceMind v{appVersion}
  </footer>
</main>
