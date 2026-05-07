<script>
  import { Accounts } from "meteor/accounts-base";
  import { Meteor } from "meteor/meteor";
  import { Tracker } from "meteor/tracker";
  import { get } from "svelte/store";
  import { locale, locales, t } from "./i18n/i18n";

  const currentOrigin = () => (typeof location === "undefined" ? "" : location.origin);
  const translateNow = (key, vars) => get(t)(key, vars);
  const localeLabels = {
    en: "English",
    zh: "Chinese",
  };

  let email = $state("");
  let code = $state("");
  let projectName = $state("");
  let mcpTokenName = $state("");
  let selectedLocale = $state("en");
  let userId = $state(null);
  let dashboard = $state(null);
  let status = $state("");
  let loading = $state(false);

  let primaryProject = $derived(dashboard?.projects?.[0]);
  let primaryMcpToken = $derived(primaryProject?.mcpTokens?.[0]);
  let sourceSummary = $derived(primaryProject ? (dashboard?.sourceSummaries?.[primaryProject._id] || []) : []);
  let summary = $derived(dashboard?.summary);
  let latestDau = $derived(summary?.dailyActiveUsers?.[summary.dailyActiveUsers.length - 1]?.count || 0);
  let captureSnippet = $derived(
    primaryProject
      ? `<script src="${currentOrigin()}/capture.js" data-tracemind-token="${primaryProject.projectKey}" async><\/script>`
      : "",
  );
  let mcpUrl = $derived(primaryMcpToken ? `${currentOrigin()}/mcp?mcpToken=${primaryMcpToken.token}` : "");

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

  async function loadDashboard() {
    if (!Meteor.userId()) return;
    dashboard = await callMethod("tracemind.dashboard");
  }

  async function createProject() {
    const name = projectName.trim();
    if (!name) return;

    loading = true;
    status = "";
    try {
      await callMethod("tracemind.project.create", name);
      projectName = "";
      await loadDashboard();
      status = translateNow("Project created.");
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

  $effect(() => locale.subscribe((value) => {
    selectedLocale = value;
  }));

  $effect(() => {
    const computation = Tracker.autorun(() => {
      userId = Meteor.userId();
      if (userId && window.TraceMind) {
        window.TraceMind.identify(userId);
      }
      if (!userId) {
        dashboard = null;
        return;
      }
      if (!dashboard) {
        loadDashboard().catch((error) => {
          status = errorMessage(error);
        });
      }
    });

    return () => computation.stop();
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
        {#if dashboard}
          <button class="ghost" type="button" onclick={logout}>{$t("Log out")}</button>
        {/if}
      </div>
    </nav>

    <div class="hero-grid">
      <div class="hero-copy">
        <div class="hero-badges">
          <span class="tm-badge tm-badge-signal">{$t("AI-native behavior intelligence")}</span>
          <span class="tm-badge tm-badge-amber">{$t("Remote MCP ready")}</span>
        </div>
        <h1>{$t("Understand real user behavior without writing complex tracking code.")}</h1>
        <p class="lede">{$t("TraceMind captures raw behavior from web products with one script, turns it into readable semantic events, and lets AI coding agents query product data through remote MCP.")}</p>
        <div class="hero-actions">
          <a href="#console" class="button">{$t("Start setup")}</a>
          <a href="#how" class="button secondary">{$t("View workflow")}</a>
        </div>
      </div>

      <div class="signal-panel card-panel" aria-label="TraceMind data flow">
        <div class="signal-panel-header">
          <span class="tm-badge tm-badge-signal">{$t("Live behavior stream")}</span>
          <span>tm_proj_xxx</span>
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
            <small>{$t("Ask from Codex, Claude Code, Cursor, and more")}</small>
          </div>
        </div>

        <div class="agent-query">
          <span>{$t("Codex asks")}</span>
          <strong>{$t("Which users reached pricing but did not submit?")}</strong>
          <p>{$t("TraceMind returns path trends, user counts, device counts, and source health.")}</p>
        </div>
      </div>
    </div>
  </section>

  <section id="how" class="workflow">
    <div>
      <p class="section-label">{$t("MVP setup flow")}</p>
      <h2>{$t("Create a product behavior understanding layer with one line of code.")}</h2>
    </div>
    <div class="one-line-example">
      <div>
        <span>{$t("Setup example")}</span>
        <strong>{$t("Put this line into your web product page")}</strong>
      </div>
      <code>&lt;script src="{currentOrigin()}/capture.js" data-tracemind-token="tm_proj_xxx" async&gt;&lt;/script&gt;</code>
    </div>
    <div class="steps">
      <article>
        <span class="tm-badge tm-badge-signal">01</span>
        <h3>{$t("Email login")}</h3>
        <p>{$t("Use an email verification code to get your project key and snippet.")}</p>
      </article>
      <article>
        <span class="tm-badge tm-badge-signal">02</span>
        <h3>{$t("Auto capture")}</h3>
        <p>{$t("Copy one global script to record page views, clicks, inputs, forms, and route changes.")}</p>
      </article>
      <article>
        <span class="tm-badge tm-badge-amber">03</span>
        <h3>{$t("Semantic events")}</h3>
        <p>{$t("The server extracts stable and readable behavior events from raw behavior.")}</p>
      </article>
      <article>
        <span class="tm-badge tm-badge-amber">04</span>
        <h3>{$t("Remote MCP")}</h3>
        <p>{$t("Add the MCP URL to your AI coding agent and inspect product data through chat.")}</p>
      </article>
    </div>
  </section>

  <section id="console" class="console">
    <div class="console-header">
      <span class="tm-badge tm-badge-muted">{$t("Developer console")}</span>
      <h2>{$t("Log in, copy your project key, and start capturing.")}</h2>
    </div>

    {#if !dashboard}
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
    {:else}
      <div class="dashboard-grid">
        <div class="account-panel card-panel">
          <span class="tm-badge tm-badge-signal">{$t("Current account")}</span>
          <strong>{dashboard.developer.email}</strong>
          <p>
            {$t("{{projects}} projects, {{raw}} raw behaviors, {{semantic}} semantic events.", {
              projects: dashboard.projects.length,
              raw: dashboard.rawCount,
              semantic: dashboard.semanticCount,
            })}
          </p>
          <div class="metrics" aria-label="Behavior analytics summary">
            <div>
              <span>{$t("Users")}</span>
              <strong>{summary?.uniqueUsers || 0}</strong>
            </div>
            <div>
              <span>{$t("DAU")}</span>
              <strong>{latestDau}</strong>
            </div>
            <div>
              <span>{$t("Devices")}</span>
              <strong>{summary?.uniqueDevices || 0}</strong>
            </div>
          </div>
          <label class="field-label">
            <span>{$t("New project")}</span>
            <input id="project-name" name="projectName" bind:value={projectName} placeholder={$t("Production Web App")} />
          </label>
          <button type="button" onclick={createProject} disabled={loading || !projectName.trim()}>
            {$t("Create project")}
          </button>
        </div>

        <div class="setup-panel card-panel">
          {#if primaryProject}
            <div class="project-title">
              <span>{$t("Project")}</span>
              <strong>{primaryProject.name}</strong>
            </div>
            <label class="field-label">
              <span>{$t("Project key")}</span>
              <input id="project-key" name="projectKey" readonly value={primaryProject.projectKey} />
            </label>
            <label class="field-label">
              <span>{$t("One-line Auto Capture code")}</span>
              <textarea id="capture-snippet" name="captureSnippet" readonly rows={3} value={captureSnippet}></textarea>
            </label>
            <label class="field-label">
              <span>{$t("Default remote MCP URL")}</span>
              <input id="mcp-url" name="mcpUrl" readonly value={mcpUrl} />
            </label>

            <div class="source-panel">
              <div class="source-header">
                <div>
                  <span>{$t("Source statistics")}</span>
                  <strong>{$t("See recent sources writing to this project key")}</strong>
                </div>
              </div>
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
                      <label class="field-label">
                        <span>{$t("MCP URL")}</span>
                        <input id={`mcp-token-url-${token._id}`} name={`mcpTokenUrl-${token._id}`} readonly value={`${currentOrigin()}/mcp?mcpToken=${token.token}`} />
                      </label>
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
                <p class="empty">{$t("This project has no MCP token. Add one before querying data through remote MCP.")}</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="events card-panel">
        <div class="events-header">
          <h3>{$t("Recent semantic events")}</h3>
          <button class="ghost" type="button" onclick={loadDashboard}>{$t("Refresh")}</button>
        </div>
        {#if dashboard.recentEvents.length}
          <ul>
            {#each dashboard.recentEvents as event (event._id)}
              <li>
                <strong>{event.title}</strong>
                <span>{event.meaning}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty">{$t("No semantic events yet. Add the script to a web product, generate behavior, then refresh.")}</p>
        {/if}
      </div>
    {/if}

    {#if status}
      <p class="status-alert">{status}</p>
    {/if}
  </section>
</main>
