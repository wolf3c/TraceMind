<script>
  import { Accounts } from "meteor/accounts-base";
  import { Meteor } from "meteor/meteor";
  import { Tracker } from "meteor/tracker";
  import { untrack } from "svelte";
  import { get } from "svelte/store";
  import packageInfo from "../../package.json";
  import {
    Developers,
    ProjectDailyReports,
    Projects,
  } from "../api/collections";
  import { summarizeProjectHealthFromDailyReports } from "../api/project_health_summary";
  import AuthPanel from "./AuthPanel.svelte";
  import { buildAgentInstallPrompt, buildWebCaptureUpdatePrompt } from "./agent_setup";
  import ConsoleStatePanel from "./ConsoleStatePanel.svelte";
  import { resolveConsoleState } from "./console_state";
  import EventStreamPanel from "./EventStreamPanel.svelte";
  import FeedbackWidget from "./FeedbackWidget.svelte";
  import IntroSections from "./IntroSections.svelte";
  import { locale, locales, t } from "./i18n/i18n";
  import ProductUpdateNotice from "./ProductUpdateNotice.svelte";
  import ProductUpdatesPage from "./ProductUpdatesPage.svelte";
  import ProjectActionNoticePanel from "./ProjectActionNoticePanel.svelte";
  import { buildProjectActionNotices } from "./project_action_notices";
  import ProjectHealthPanel from "./ProjectHealthPanel.svelte";
  import ProjectSetupPanel from "./ProjectSetupPanel.svelte";
  import {
    mergeBlockedSourcesIntoSourceSummary,
    mergeProjectIntoDashboard,
    resolveInitialProjectSummaryState,
    resolveSelectedProjectId,
    resolveInitialSetupDetailsState,
    shouldLoadProjectSummaryForSetup,
    shouldAutoRefreshProjectHealth,
    shouldApplyProjectSummaryResponse,
  } from "./project_console_state";

  const currentOrigin = () => (typeof location === "undefined" ? "" : location.origin);
  const normalizeAppPath = (path = "/") => {
    const normalizedPath = String(path || "/").replace(/\/+$/, "");
    return normalizedPath || "/";
  };
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
  const statusAutoDismissMs = 5200;
  const recentOnlineLazyLoadDelayMs = 0;
  const recentOnlineAutoRefreshIntervalMs = 60 * 1000;
  const projectHealthAutoRefreshIntervalMs = 5 * 60 * 1000;

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
  let loadingProvider = $state("");
  let loginCodeRequested = $state(false);
  let loginServicesReady = $state(Accounts.loginServicesConfigured());
  let oauthServices = $state({ google: false, github: false });
  let selectedProjectId = $state("");
  let showProjectCreate = $state(false);
  let showProjectActions = $state(false);
  let showProjectRename = $state(false);
  let showSetupDetails = $state(resolveInitialSetupDetailsState());
  let showActiveTimeTip = $state(false);
  let recentOnline = $state(null);
  let recentOnlineLoading = $state(false);
  let recentOnlineError = $state("");
  let recentOnlineRequestId = $state(0);
  let recentOnlineLastLoadedAt = $state(null);
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
  let currentPath = $state(normalizeAppPath(typeof location === "undefined" ? "/" : location.pathname));
  let dashboardLoadPromise = null;
  let copiedTargetTimer = null;
  let statusTimer = null;

  function publicProjectFromClient(project) {
    if (!project) return null;
    return {
      _id: project._id,
      name: project.name,
      projectKey: project.projectKey,
      mcpTokens: project.mcpTokens || [],
      blockedSources: project.blockedSources || [],
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  function buildDashboardFromPublications(developer, projects = [], previousDashboard = dashboard) {
    if (!developer) return null;
    return {
      ...(previousDashboard || {}),
      developer: { email: developer.email },
      projects: projects.map(publicProjectFromClient).filter(Boolean),
    };
  }

  let consoleState = $derived(resolveConsoleState({
    dashboard,
    userId,
    loggingIn,
    dashboardLoadError,
  }));
  let shouldShowIntro = $derived(consoleState === "signed-out" || showIntro);
  let isProductUpdatesPage = $derived(currentPath === "/product-updates");
  let primaryProject = $derived(
    dashboard?.projects?.find((project) => project._id === selectedProjectId) || dashboard?.projects?.[0],
  );
  let primaryMcpToken = $derived(primaryProject?.mcpTokens?.[0]);
  let sourceSummary = $derived(selectedProjectSummary?.sources || []);
  let ingestionGuardSummary = $derived(selectedProjectSummary?.ingestionGuard || { states: [], recentRollups: [] });
  let summary = $derived(summaryFromHealth(publishedProjectHealth || selectedMethodProjectHealth()) || selectedProjectSummary?.summary);
  let health = $derived(publishedProjectHealth || selectedMethodProjectHealth());
  let healthCurrent = $derived(health?.current || {});
  let captureScriptFindings = $derived((health?.captureScriptFindings?.length ? health.captureScriptFindings : healthCurrent?.captureScriptFindings) || []);
  let delivery = $derived(publishedDailyReport?.delivery || (
    selectedProjectSummary?.summaryWindow?.reportDate === selectedReportDate ? selectedProjectSummary?.delivery : {}
  ));
  let deliveryDropped = $derived(Number(delivery.droppedOldest || 0) + Number(delivery.droppedStorage || 0));
  let displayedRecentEvents = $derived(eventStreamEvents);
  let projectSummaryRefreshAge = $derived(formatRefreshAge(reportLoadedAt(), refreshAgeTick, selectedLocale));
  let todayReportDate = $derived(reportDateForDate(refreshAgeTick));
  let yesterdayReportDate = $derived(addReportDays(todayReportDate, -1));
  let dayBeforeReportDate = $derived(addReportDays(todayReportDate, -2));
  let isSelectedReportToday = $derived(selectedReportDate === todayReportDate);
  let projectHealthRefreshStatus = $derived(`${translateNow(isSelectedReportToday ? "Auto update" : "Report snapshot")} · ${projectSummaryRefreshAge}`);
  let recentOnlineRefreshAge = $derived(formatRefreshAge(recentOnlineLastLoadedAt, refreshAgeTick, selectedLocale, true));
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
  let webCaptureUpdatePrompt = $derived(
    captureScriptFindings.length
      ? buildWebCaptureUpdatePrompt({
        locale: selectedLocale,
        findings: captureScriptFindings,
      })
      : "",
  );
  let projectActionNotices = $derived(buildProjectActionNotices({
    locale: selectedLocale,
    captureScriptFindings,
    copiedTarget,
    webCaptureUpdatePrompt,
    copyWebCaptureUpdatePrompt,
    translate: translateNow,
  }));

  function callMethod(name, ...args) {
    return new Promise((resolve, reject) => {
      Meteor.call(name, ...args, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  function requestDailyReportRefresh(projectId = selectedProjectId, reportDate = selectedReportDate) {
    if (!shouldAutoRefreshProjectHealth({ selectedReportDate: reportDate, todayReportDate })) return;
    if (!Meteor.userId() || !projectId || !reportDate) return;
    callMethod("tracemind.project.dailyReports.refresh", projectId, reportDate).catch(() => {});
  }

  function documentIsVisible() {
    return typeof document === "undefined" || document.visibilityState === "visible";
  }

  function errorMessage(error) {
    const messages = {
      "invalid-email": "Enter a valid email address.",
      "invalid-code": "The verification code is invalid or expired.",
      "not-authorized": "Log in first.",
      "not-found": "Project not found.",
    };
    const reason = error.reason || error.message || "";

    if (error.error === "oauth-email-required") return translateNow("Could not finish OAuth login.");
    if (reason.includes("Service not configured") || reason.includes("not configured")) {
      return translateNow("OAuth login is not configured yet.");
    }
    if (reason.includes("Expired token")) return translateNow("The verification code expired. Request a new one.");
    if (reason.includes("token mismatch") || reason.includes("Email or token mismatch")) {
      return translateNow("The verification code is incorrect. Check the email and try again.");
    }

    return messages[error.error] ? translateNow(messages[error.error]) : reason;
  }

  function clearStatusTimer() {
    if (!statusTimer || typeof window === "undefined") return;
    window.clearTimeout(statusTimer);
    statusTimer = null;
  }

  function showStatus(message, { autoDismiss = false } = {}) {
    clearStatusTimer();
    status = message;
    if (!message || !autoDismiss || typeof window === "undefined") return;
    statusTimer = window.setTimeout(() => {
      status = "";
      statusTimer = null;
    }, statusAutoDismissMs);
  }

  function showSuccessStatus(message) {
    showStatus(message, { autoDismiss: true });
  }

  function dismissStatus() {
    showStatus("");
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

  function resetRecentOnline() {
    recentOnlineRequestId += 1;
    recentOnline = null;
    recentOnlineLoading = false;
    recentOnlineError = "";
    recentOnlineLastLoadedAt = null;
  }

  function syncSelectedProject(nextDashboard) {
    const projects = nextDashboard?.projects || [];
    const nextSelectedProjectId = resolveSelectedProjectId(projects, selectedProjectId);
    if (!nextSelectedProjectId) {
      selectedProjectId = "";
      ({ selectedProjectSummary, projectSummaryLoading, projectSummaryError } = resolveInitialProjectSummaryState());
      projectSummaryLastLoadedAt = null;
      resetEventStream();
      resetRecentOnline();
      showSetupDetails = false;
    } else if (nextSelectedProjectId !== selectedProjectId) {
      if (!selectedProjectId) {
        showSetupDetails = resolveInitialSetupDetailsState();
      }
      selectedProjectId = nextSelectedProjectId;
      selectedProjectSummary = null;
      projectSummaryLastLoadedAt = null;
      resetEventStream();
      resetRecentOnline();
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

  function loadProjectSummaryIfNeeded(projectId = selectedProjectId, reportDate = selectedReportDate) {
    if (!shouldLoadProjectSummaryForSetup({
      projectId,
      reportDate,
      selectedProjectSummary,
      projectSummaryLoading,
    })) {
      return Promise.resolve(selectedProjectSummary);
    }

    return loadProjectSummary(projectId, reportDate);
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

  async function loadRecentOnline(projectId = selectedProjectId, reportDate = selectedReportDate) {
    const requestUserId = Meteor.userId();
    if (!requestUserId || !projectId || reportDate !== todayReportDate) {
      return null;
    }

    const requestId = recentOnlineRequestId + 1;
    recentOnlineRequestId = requestId;
    recentOnlineLoading = true;
    recentOnlineError = "";

    try {
      const result = await callMethod("tracemind.project.recentOnline", projectId);
      if (
        requestId !== recentOnlineRequestId
        || requestUserId !== Meteor.userId()
        || projectId !== selectedProjectId
        || reportDate !== selectedReportDate
        || reportDate !== todayReportDate
      ) {
        return null;
      }
      recentOnline = result;
      recentOnlineLastLoadedAt = new Date();
      refreshAgeTick = Date.now();
      return result;
    } catch (error) {
      if (
        requestId === recentOnlineRequestId
        && requestUserId === Meteor.userId()
        && projectId === selectedProjectId
        && reportDate === selectedReportDate
        && reportDate === todayReportDate
      ) {
        recentOnlineError = errorMessage(error);
      }
      throw error;
    } finally {
      if (
        requestId === recentOnlineRequestId
        && requestUserId === Meteor.userId()
        && projectId === selectedProjectId
        && reportDate === selectedReportDate
        && reportDate === todayReportDate
      ) {
        recentOnlineLoading = false;
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

  function oauthLogin(provider, loginMethod, options) {
    const configured = Boolean(oauthServices[provider]);
    if (!configured || typeof loginMethod !== "function") {
      showStatus(translateNow("OAuth login is not configured yet."));
      return Promise.resolve();
    }

    loading = true;
    loadingProvider = provider;
    showStatus(translateNow(provider === "google" ? "Signing in with Google..." : "Signing in with GitHub..."));

    return new Promise((resolve, reject) => {
      loginMethod(options, (error) => {
        if (error) reject(error);
        else resolve();
      });
    })
      .then(() => loadDashboard())
      .then(() => {
        loginCodeRequested = false;
        showSuccessStatus(translateNow("Logged in."));
      })
      .catch((error) => {
        showStatus(errorMessage(error) || translateNow("Could not finish OAuth login."));
      })
      .finally(() => {
        loading = false;
        loadingProvider = "";
      });
  }

  function loginWithGoogle() {
    return oauthLogin("google", Meteor.loginWithGoogle, {
      requestPermissions: ["email"],
    });
  }

  function loginWithGithub() {
    return oauthLogin("github", Meteor.loginWithGithub, {
      requestPermissions: ["user:email"],
    });
  }

  async function requestCode() {
    loading = true;
    showStatus("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await requestLoginToken({
        selector: { email: normalizedEmail },
        userData: { email: normalizedEmail },
      });
      loginCodeRequested = true;
      showSuccessStatus(translateNow("Verification code sent. Check your inbox or use the login link in the email."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function verifyCode() {
    loading = true;
    showStatus("");
    try {
      await passwordlessLogin({ email: email.trim().toLowerCase() }, code.trim());
      await loadDashboard();
      loginCodeRequested = false;
      showSuccessStatus(translateNow("Logged in."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function loadDashboard() {
    const requestUserId = Meteor.userId();
    if (!requestUserId) return null;
    if (dashboardLoadPromise) return dashboardLoadPromise;

    const requestId = dashboardRequestId + 1;
    dashboardRequestId = requestId;
    dashboardLoading = true;
    dashboardLoadError = "";

    const loadPromise = callMethod("tracemind.dashboard.bootstrap")
      .then((result) => {
        if (requestId !== dashboardRequestId || requestUserId !== Meteor.userId()) return null;
        return result;
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
    showStatus("");
    try {
      await loadDashboard();
    } catch (error) {
      if (dashboard) {
        showStatus(errorMessage(error));
      }
    }
  }

  function selectReportDate(reportDate) {
    if (!reportDate || reportDate === selectedReportDate) return;
    selectedReportDate = reportDate;
    resetEventStream();
    resetRecentOnline();
    requestDailyReportRefresh(selectedProjectId, reportDate);
    if (showSetupDetails) {
      loadProjectSummaryIfNeeded(selectedProjectId, reportDate).catch(() => {});
    }
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
    resetRecentOnline();
    showProjectCreate = false;
    showProjectActions = false;
    showProjectRename = false;
    if (showSetupDetails) {
      loadProjectSummaryIfNeeded(nextProjectId).catch(() => {});
    }
  }

  function toggleProjectActions() {
    showProjectActions = !showProjectActions;
    if (!showProjectActions) showProjectRename = false;
  }

  function handleSetupDetailsOpened() {
    loadProjectSummaryIfNeeded().catch(() => {});
  }

  function handleSetupDetailsChange(expanded) {
    if (expanded) {
      handleSetupDetailsOpened();
    }
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
    showStatus("");
    try {
      const createdProject = await callMethod("tracemind.project.create", name);
      replaceProject(createdProject);
      selectedProjectId = createdProject._id;
      resetEventStream();
      resetRecentOnline();
      projectName = "";
      showProjectCreate = false;
      showProjectActions = false;
      showProjectRename = false;
      requestDailyReportRefresh(createdProject._id, selectedReportDate);
      if (showSetupDetails) {
        loadProjectSummaryIfNeeded(createdProject._id).catch(() => {});
      }
      showSuccessStatus(translateNow("Project created and selected."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function renameProject() {
    if (!primaryProject) return;
    const name = renameProjectName.trim();
    if (!name) return;

    loading = true;
    showStatus("");
    try {
      await callMethod("tracemind.project.rename", primaryProject._id, name);
      showProjectRename = false;
      renameProjectName = "";
      showSuccessStatus(translateNow("Project name updated."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function removeProject() {
    if (!primaryProject) return;
    if (!window.confirm(translateNow("Delete project {{project}}? This permanently deletes its project key, MCP tokens, raw behaviors, and semantic events.", { project: primaryProject.name }))) return;

    const removedProjectId = primaryProject._id;
    loading = true;
    showStatus("");
    try {
      await callMethod("tracemind.project.remove", removedProjectId);
      selectedProjectSummary = null;
      projectSummaryRequestId += 1;
      projectSummaryLoading = false;
      projectSummaryError = "";
      projectSummaryLastLoadedAt = null;
      selectedProjectId = "";
      resetEventStream();
      resetRecentOnline();
      showProjectActions = false;
      showProjectRename = false;
      showProjectCreate = false;
      showSetupDetails = false;
      showSuccessStatus(translateNow("Project deleted."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  function replaceProject(updatedProject) {
    dashboard = mergeProjectIntoDashboard(dashboard, updatedProject);
  }

  function replaceProjectSourceState(updatedProject) {
    replaceProject(updatedProject);
    if (selectedProjectSummary?.project?._id !== updatedProject?._id) return;

    selectedProjectSummary = {
      ...selectedProjectSummary,
      project: updatedProject,
      sources: mergeBlockedSourcesIntoSourceSummary(
        selectedProjectSummary.sources || [],
        updatedProject.blockedSources || [],
      ),
    };
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
    showStatus("");
    try {
      await callMethod(
        "tracemind.project.mcpToken.create",
        primaryProject._id,
        mcpTokenName.trim() || "MCP Token",
      );
      mcpTokenName = "";
      showSuccessStatus(translateNow("MCP token created."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function renameMcpToken(token) {
    if (!primaryProject || !token) return;

    loading = true;
    showStatus("");
    try {
      await callMethod(
        "tracemind.project.mcpToken.rename",
        primaryProject._id,
        token.id,
        token.name,
      );
      showSuccessStatus(translateNow("MCP token name updated."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function refreshMcpToken(token) {
    if (!primaryProject || !token) return;
    if (!window.confirm(translateNow("Refreshing this MCP token immediately invalidates the old token. Continue?"))) return;

    loading = true;
    showStatus("");
    try {
      await callMethod(
        "tracemind.project.mcpToken.refresh",
        primaryProject._id,
        token.id,
      );
      showSuccessStatus(translateNow("MCP token refreshed. The old token is invalid."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function removeMcpToken(token) {
    if (!primaryProject || !token) return;
    if (!window.confirm(translateNow("Deleting this MCP token immediately invalidates it. Continue?"))) return;

    loading = true;
    showStatus("");
    try {
      await callMethod(
        "tracemind.project.mcpToken.remove",
        primaryProject._id,
        token.id,
      );
      showSuccessStatus(translateNow("MCP token deleted."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function copyAgentInstallPrompt() {
    const copied = await copyText("agent-install-prompt", agentInstallPrompt, "Agent install prompt copied.");
    if (copied) recordAgentInstallPromptCopied().catch((error) => {
      console.warn("TraceMind setup attempt recording failed", error);
    });
  }

  async function copyWebCaptureUpdatePrompt() {
    await copyText("web-capture-update-prompt", webCaptureUpdatePrompt, "Web Auto Capture update instruction copied.");
  }

  async function copyText(target, value, message) {
    if (!value || !navigator?.clipboard) {
      showStatus(translateNow("Clipboard is unavailable in this browser."));
      return false;
    }
    try {
      await navigator.clipboard.writeText(value);
      copiedTarget = target;
      showSuccessStatus(translateNow(message));
      if (copiedTargetTimer) window.clearTimeout(copiedTargetTimer);
      copiedTargetTimer = window.setTimeout(() => {
        copiedTarget = "";
        copiedTargetTimer = null;
      }, 1800);
      return true;
    } catch (error) {
      showStatus(errorMessage(error));
      return false;
    }
  }

  function setupAttemptAttribution() {
    const params = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search || "");
    const referrer = typeof document === "undefined" ? "" : document.referrer;
    let referrerDomain = "";
    if (referrer) {
      try {
        referrerDomain = new URL(referrer).hostname;
      } catch (error) {
        referrerDomain = "";
      }
    }

    const currentHost = typeof location === "undefined" ? "" : location.hostname;
    const referrerType = referrerDomain
      ? (referrerDomain === currentHost ? "internal" : "external")
      : "direct";
    const landingPath = typeof location === "undefined"
      ? "/"
      : `${location.pathname || "/"}${location.hash || ""}`;

    return {
      source: params.get("utm_source") || referrerDomain || "direct",
      medium: params.get("utm_medium") || (referrerDomain ? "external" : "direct"),
      campaign: params.get("utm_campaign") || "",
      content: params.get("utm_content") || "",
      referrerDomain,
      referrerType,
      landingPath,
      gclidPresent: params.has("gclid"),
      fbclidPresent: params.has("fbclid"),
    };
  }

  async function recordAgentInstallPromptCopied() {
    if (!primaryProject?._id || !primaryMcpToken?.id) return;
    await callMethod(
      "tracemind.setupAttempt.create",
      primaryProject._id,
      primaryMcpToken.id,
      selectedLocale,
      setupAttemptAttribution(),
    );
  }

  async function blockSource(source) {
    if (!primaryProject || !source) return;
    const sourceName = source.sourceLabel || source.sourceKey;
    if (!window.confirm(translateNow("Block source {{source}}? New events from it will be silently rejected.", { source: sourceName }))) return;

    loading = true;
    showStatus("");
    try {
      const updatedProject = await callMethod("tracemind.project.source.block", primaryProject._id, {
        sourceType: source.sourceType,
        sourceKey: source.sourceKey,
        sourceLabel: source.sourceLabel,
        reason: "Blocked from console",
      });
      replaceProjectSourceState(updatedProject);
      showSuccessStatus(translateNow("Source blocked. Future events from it will not enter the database."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function unblockSource(source) {
    if (!primaryProject || !source) return;

    loading = true;
    showStatus("");
    try {
      const updatedProject = await callMethod("tracemind.project.source.unblock", primaryProject._id, {
        sourceType: source.sourceType,
        sourceKey: source.sourceKey,
      });
      replaceProjectSourceState(updatedProject);
      showSuccessStatus(translateNow("Source unblocked."));
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  function logout() {
    showStatus("");
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
    resetRecentOnline();
    showProjectCreate = false;
    showProjectActions = false;
    showProjectRename = false;
    showSetupDetails = false;
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

  function formatTime(value) {
    if (!value) return translateNow("Unknown");
    return new Date(value).toLocaleTimeString(selectedLocale === "zh" ? "zh-CN" : "en-US", {
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

  function formatRefreshAge(value, nowValue = Date.now(), localeValue = selectedLocale, compact = false) {
    if (!value) return translateNow("Not refreshed yet");
    const elapsedMs = Math.max(0, Number(nowValue) - new Date(value).getTime());
    const elapsedMinutes = Math.floor(elapsedMs / 60000);

    if (elapsedMinutes < 1) return translateNow(compact ? "just now" : "Last refreshed just now");
    if (elapsedMinutes < 60) {
      return translateNow(compact ? "{{count}} min ago" : "Last refreshed {{count}} min ago", { count: elapsedMinutes });
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    return translateNow(compact ? "{{count}} hr ago" : "Last refreshed {{count}} hr ago", { count: elapsedHours });
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
    if (!numericValue) return translateNow("Flat");
    const direction = numericValue > 0 ? "↑" : "↓";
    return `${direction} ${Math.round(Math.abs(numericValue) * 100)}%`;
  }

  function formatTrendContext(value, comparisonMode = "full_day") {
    const numericValue = Number(value || 0);
    const comparison = comparisonMode === "completed_hours"
      ? translateNow("Compared with yesterday same hours")
      : translateNow("Compared with previous day");
    if (!numericValue) return comparison;
    const direction = numericValue > 0 ? translateNow("increased") : translateNow("decreased");
    return translateNow("{{comparison}} {{direction}} {{percent}}", {
      comparison,
      direction,
      percent: `${Math.round(Math.abs(numericValue) * 100)}%`,
    });
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
    if (!requestUserId) return;

    const computation = Tracker.autorun(() => {
      const developerHandle = Meteor.subscribe("tracemind.developer.profile");
      const projectsHandle = Meteor.subscribe("tracemind.projects");
      const developer = Developers.findOne({ userId: requestUserId });
      const projects = Projects.find({}, { sort: { createdAt: 1 } }).fetch();
      const ready = developerHandle.ready() && projectsHandle.ready();

      untrack(() => {
        if (requestUserId !== Meteor.userId()) return;
        if (developer) {
          const nextDashboard = buildDashboardFromPublications(developer, projects);
          const previousSelectedProjectId = selectedProjectId;
          syncSelectedProject(nextDashboard);
          dashboard = nextDashboard;
          dashboardLoadError = "";
          if (ready) dashboardLoading = false;
          if (selectedProjectId && selectedProjectId !== previousSelectedProjectId && showSetupDetails) {
            loadProjectSummaryIfNeeded(selectedProjectId).catch(() => {});
          }
        } else if (ready) {
          dashboard = null;
          dashboardLoading = false;
        }
      });
    });

    return () => computation.stop();
  });

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

    const refreshTimer = shouldAutoRefreshProjectHealth({ selectedReportDate: reportDate, todayReportDate })
      ? window.setInterval(() => {
        untrack(() => {
          if (documentIsVisible()) {
            requestDailyReportRefresh(projectId, reportDate);
          }
        });
      }, projectHealthAutoRefreshIntervalMs)
      : null;

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

    return () => {
      computation.stop();
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  });

  $effect(() => {
    const requestUserId = userId;
    const projectId = selectedProjectId;
    const reportDate = selectedReportDate;
    const shouldLoadRecentOnline = Boolean(requestUserId && projectId && reportDate === todayReportDate);

    if (!shouldLoadRecentOnline) {
      untrack(() => {
        if (recentOnline || recentOnlineLoading || recentOnlineError) resetRecentOnline();
      });
      return;
    }

    const loadRecentOnlineIfVisible = () => {
      untrack(() => {
        if (documentIsVisible() && !recentOnlineLoading) {
          loadRecentOnline(projectId, reportDate).catch(() => {});
        }
      });
    };

    const timer = window.setTimeout(() => {
      untrack(() => {
        if (!recentOnline && !recentOnlineLoading) {
          loadRecentOnlineIfVisible();
        }
      });
    }, recentOnlineLazyLoadDelayMs);
    const refreshTimer = window.setInterval(loadRecentOnlineIfVisible, recentOnlineAutoRefreshIntervalMs);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(refreshTimer);
    };
  });

  $effect(() => {
    const computation = Tracker.autorun(() => {
      untrack(() => {
        const nextUserId = Meteor.userId();
        const nextLoggingIn = Meteor.loggingIn();
        loginServicesReady = Accounts.loginServicesConfigured();
        oauthServices = {
          google: Boolean(Accounts.loginServiceConfiguration.findOne({ service: "google" })),
          github: Boolean(Accounts.loginServiceConfiguration.findOne({ service: "github" })),
        };
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
            resetRecentOnline();
            showProjectCreate = false;
            showProjectActions = false;
            showProjectRename = false;
            showSetupDetails = false;
            loginCodeRequested = false;
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
    const syncRoute = () => {
      currentPath = normalizeAppPath(window.location.pathname);
    };

    syncRoute();
    window.addEventListener("popstate", syncRoute);

    return () => window.removeEventListener("popstate", syncRoute);
  });

  $effect(() => {
    const timer = window.setInterval(() => {
      refreshAgeTick = Date.now();
    }, 30000);

    return () => window.clearInterval(timer);
  });
</script>

<main class="shell">
  {#if isProductUpdatesPage}
    <ProductUpdatesPage />
  {:else}
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
    <ProductUpdateNotice {appVersion} canShowReminder={Boolean(userId)} />

    <section id="console" class="console">
    {#if consoleState === "signed-out"}
      <div class="console-header">
        <span class="tm-badge tm-badge-muted">{$t("Developer console")}</span>
        <h2>{$t("Capture real user behavior after login")}</h2>
      </div>

      <AuthPanel
        bind:email
        bind:code
        {loading}
        {loadingProvider}
        codeRequested={loginCodeRequested}
        {status}
        {loginServicesReady}
        {oauthServices}
        {loginWithGoogle}
        {loginWithGithub}
        {requestCode}
        {verifyCode}
        {dismissStatus}
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
          bind:showSetupDetails
          {handleSetupDetailsChange}
          {projectSummaryLoading}
          {projectSummaryError}
          {copiedTarget}
          {agentInstallPrompt}
          {sourceSummary}
          {ingestionGuardSummary}
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

      {#if projectActionNotices.length}
        <ProjectActionNoticePanel notices={projectActionNotices} />
      {/if}

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
          {projectHealthRefreshStatus}
          {showActiveTimeTip}
          {recentOnline}
          {recentOnlineLoading}
          {recentOnlineError}
          {recentOnlineRefreshAge}
          {selectReportDate}
          {changeReportDate}
          {toggleActiveTimeTip}
          {formatNumber}
          {formatDecimal}
          {formatDuration}
          {formatTime}
          {compactDate}
          {formatTrend}
          {formatTrendContext}
          {trendClass}
          {retentionText}
          {topCountText}
          {topItemLabel}
          {bouncePageMetricText}
        />
        <EventStreamPanel
          {primaryProject}
          {healthCurrent}
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

    {#if consoleState !== "signed-out" && status}
      <div class="status-alert" role="status" aria-live="polite">
        <span>{status}</span>
        <button class="status-dismiss" type="button" onclick={dismissStatus} aria-label={$t("Dismiss status message")}>
          &times;
        </button>
      </div>
    {/if}
    </section>
  {/if}

  {#if !isProductUpdatesPage}
    <FeedbackWidget accountEmail={dashboard?.developer?.email || ""} />
  {/if}
</main>
