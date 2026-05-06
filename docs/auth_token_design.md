# Auth and Token Design

## Purpose

Provide the minimum login and authorization flow developers need before installing TraceMind in their own web product.

## Flow

1. Developer enters an email address on the landing page console.
2. Client calls `Accounts.requestLoginTokenForUser()` from `accounts-passwordless`.
3. Meteor Accounts creates or finds the user in `Meteor.users` and sends the one-time token through Meteor `email`.
4. Developer submits the token, or clicks the magic login link from the email.
5. Client calls `Meteor.passwordlessLoginWithToken()`.
6. After login, TraceMind server uses `this.userId` to create or reuse a developer in `tracemind_developers`, and returns:
   - `projectKey`: public capture and MCP key for the default project.

The developer `authToken` still exists internally for compatibility with early API experiments, but the MVP console does not expose it. New users only need the project key.

## Collections

- `Meteor.users`: owned by Meteor Accounts and `accounts-passwordless`.
- `Developers`: `{ userId, email, authToken, createdAt }`
- `Projects`: `{ developerId, name, projectKey, createdAt }`

## Server Methods

- `tracemind.dashboard()`
- `tracemind.project.create(name)`
- `tracemind.project.summary(projectId)`
- `tracemind.project.summaryByToken(authToken, projectId)` internal compatibility method, not shown in the UI.

## MVP Decisions

- No password login.
- No OAuth.
- Human login uses Meteor Accounts with `accounts-passwordless`.
- Email sending uses Meteor `email` and Mailgun SMTP through `MAIL_URL`.
- TraceMind exposes only `projectKey` in the UI because SDK capture and MCP read access use the project-level key in the MVP.
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
