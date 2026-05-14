<script>
  import { t } from "./i18n/i18n";

  let {
    primaryProject,
    dashboard,
    selectedProjectId,
    newProjectOption,
    loading,
    projectName = $bindable(),
    renameProjectName = $bindable(),
    mcpTokenName = $bindable(),
    showProjectCreate,
    showProjectActions,
    showProjectRename,
    copiedTarget,
    agentInstallPrompt,
    sourceSummary,
    currentOrigin,
    copiedLabel,
    changeSelectedProject,
    toggleProjectActions,
    startProjectRename,
    removeProject,
    createProject,
    cancelProjectCreate,
    renameProject,
    cancelProjectRename,
    copyText,
    copyAgentInstallPrompt,
    createMcpToken,
    renameMcpToken,
    refreshMcpToken,
    removeMcpToken,
    updateMcpTokenName,
    formatDate,
    blockSource,
    unblockSource,
  } = $props();

  let showSetupDetails = $state(false);

  function toggleSetupDetails() {
    showSetupDetails = !showSetupDetails;
  }

  function changeProject(event) {
    if (event?.currentTarget?.value === newProjectOption) {
      showSetupDetails = true;
    }
    changeSelectedProject(event);
  }
</script>

<div class="setup-panel card-panel">
  {#if primaryProject}
    <div class="project-compact-header">
      <label class="project-switch-compact" for="selected-project">
        <span class="sr-only">{$t("Switch project")}</span>
        <select id="selected-project" name="selectedProject" value={selectedProjectId} onchange={changeProject}>
          {#each dashboard.projects as project (project._id)}
            <option value={project._id}>{project.name}</option>
          {/each}
          <option value={newProjectOption}>{$t("New project")}</option>
        </select>
      </label>
      <button
        class="ghost setup-toggle"
        type="button"
        aria-controls="project-setup-details"
        aria-expanded={showSetupDetails}
        onclick={toggleSetupDetails}
      >
        {showSetupDetails ? $t("Collapse setup details") : $t("Expand setup details")}
      </button>
      {#if dashboard.projects.length > 1}
        <span class="project-count">{$t("{{projects}} projects.", { projects: dashboard.projects.length })}</span>
      {/if}
    </div>
    <div id="project-setup-details" class="project-setup-details" hidden={!showSetupDetails}>
      <div class="project-action-menu">
        <button class="ghost project-more-button" type="button" onclick={toggleProjectActions} aria-expanded={showProjectActions} aria-label={$t("Project actions")}>
          &ctdot;
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
              <strong>{$t("Assign independent MCP credentials to members or agents")}</strong>
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
                    <input id={`mcp-token-name-${token.id}`} name={`mcpTokenName-${token.id}`} value={token.name} oninput={(event) => updateMcpTokenName(token.id, event.currentTarget.value)} />
                  </label>
                  <label class="field-label">
                    <span>{$t("Token")}</span>
                    <input id={`mcp-token-value-${token.id}`} name={`mcpTokenValue-${token.id}`} readonly value={token.token} />
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
            <p class="empty">{$t("This project has no MCP token. Add one so AI agents can read semantic events and submit developer feedback.")}</p>
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
    </div>
  {/if}
</div>
