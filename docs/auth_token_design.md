# Auth and Token Design

## Purpose

Provide the minimum login and authorization flow developers need before installing TraceMind in their own web product.

## Flow

1. Developer enters an email address on the landing page console.
2. Client calls `Accounts.requestLoginTokenForUser()` from `accounts-passwordless`.
3. Meteor Accounts creates or finds the user in `Meteor.users` and sends the one-time token through Meteor `email`.
4. Developer submits the token, or clicks the magic login link from the email.
5. Client calls `Meteor.passwordlessLoginWithToken()`.
6. After login, TraceMind server uses `this.userId` to create or reuse a developer in `tracemind_developers`, ensures a default project exists, and publishes:
   - `projectKey`: public Auto Capture key for the default project.
   - `mcpTokens`: one or more independent MCP tokens for the default project. These tokens read behavior evidence and user feedback, submit developer feedback reports, and update user feedback handling status/notes.

The developer `authToken` still exists internally for compatibility with early API experiments, but the MVP console does not expose it. New users only need the project key.

## Client Session Restore

Meteor Accounts restores the browser session asynchronously after a page refresh. The console UI must not treat a missing `dashboard` object as proof that the developer is signed out. It distinguishes session restore, confirmed signed-out, dashboard loading, dashboard error, and ready states so production latency does not briefly show the email login form to an already authenticated developer.

After the session is restored, the console calls `tracemind.dashboard.bootstrap()` to create missing developer/project records, then subscribes to `tracemind.developer.profile` and `tracemind.projects`. Minimongo becomes the cache for account and project setup state, including date-independent fields such as project name, project key, MCP tokens, and blocked sources. Project writes still go through methods so server-side ownership checks stay authoritative.

## Collections

- `Meteor.users`: owned by Meteor Accounts and `accounts-passwordless`.
- `Developers`: `{ userId, email, authToken, createdAt }`
- `Projects`: `{ developerId, name, projectKey, mcpTokens, createdAt }`

## Server Reads and Methods

- `tracemind.developer.profile` publication exposes only owner profile fields needed by the console and excludes developer `authToken`.
- `tracemind.projects` publication exposes only projects owned by the logged-in developer and excludes internal `developerId`.
- `tracemind.dashboard.bootstrap()`
- `tracemind.dashboard()`
- `tracemind.project.create(name)`
- `tracemind.project.summary(projectId)`
- `tracemind.project.summaryByToken(authToken, projectId)` internal compatibility method, not shown in the UI.

## MVP Decisions

- No password login.
- No OAuth.
- Human login uses Meteor Accounts with `accounts-passwordless`.
- Email sending uses Meteor `email` and Mailgun SMTP through `MAIL_URL`.
- TraceMind exposes `projectKey` for Auto Capture and separate MCP tokens for MCP access. Project keys are public write identifiers and cannot query MCP. MCP tokens can read behavior evidence and terminal user feedback, write developer feedback reports through `tracemind.submit_feedback`, and update only user feedback workflow fields through `tracemind.update_user_feedback`; developer feedback writes are deduplicated and rate limited per project/token.
- Public project keys are protected by post-ingestion governance rather than a required setup-time whitelist in the MVP: the console shows source statistics, and owners can block a `sourceType + sourceKey` so future events from that source are accepted at the HTTP layer but not stored.
- Developer `authToken` should stay hidden until there is a separate management API that actually needs it.

## Mailgun Configuration

Do not commit the real SMTP URL. For local development, put it in a private settings file or export it as an environment variable:

```json
{
  "private": {
    "MAIL_URL": "smtp://postmaster%40email.super-tree.com:password@smtp.mailgun.org:587"
  }
}
```

Then start Meteor with:

```bash
meteor run --settings settings.json
```

Meteor's `email` package also supports the standard environment variable form:

```bash
MAIL_URL="smtp://postmaster%40email.super-tree.com:password@smtp.mailgun.org:587" npm start
```
