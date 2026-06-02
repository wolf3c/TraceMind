import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { isValidEmail, normalizeEmail } from '/imports/api/tracemind';

const OAUTH_EMAIL_SERVICES = new Set(['google', 'github']);

let configured = false;

function primaryGithubEmail(emails = []) {
  if (!Array.isArray(emails)) return '';
  const primary = emails.find((email) => email?.primary) || emails[0];
  return primary?.email || '';
}

export function emailFromOAuthServiceData(serviceName, serviceData = {}) {
  if (!OAUTH_EMAIL_SERVICES.has(serviceName)) return '';
  if (serviceName === 'google' && serviceData.verified_email === false) return '';

  const email = normalizeEmail(serviceData.email || primaryGithubEmail(serviceData.emails));
  return isValidEmail(email) ? email : '';
}

export function emailFromUserAccount(user = {}) {
  const accountEmail = normalizeEmail(user?.emails?.find((email) => email?.address)?.address);
  if (isValidEmail(accountEmail)) return accountEmail;

  return emailFromOAuthServiceData('google', user?.services?.google)
    || emailFromOAuthServiceData('github', user?.services?.github);
}

function oauthServiceNameForUser(user = {}) {
  return [...OAUTH_EMAIL_SERVICES].find((serviceName) => user?.services?.[serviceName]);
}

function buildEmailRecord(serviceName, serviceData = {}, email) {
  if (serviceName === 'google') {
    return { address: email, verified: serviceData.verified_email !== false };
  }

  const githubEmail = Array.isArray(serviceData.emails)
    ? serviceData.emails.find((item) => normalizeEmail(item?.email) === email)
    : null;
  return { address: email, verified: githubEmail?.verified !== false };
}

function normalizeExternalServiceData(serviceName, serviceData = {}) {
  const email = emailFromOAuthServiceData(serviceName, serviceData);
  if (email) serviceData.email = email;
  return email;
}

export function configureOAuthAccounts() {
  if (configured) return;
  configured = true;

  Accounts.setAdditionalFindUserOnExternalLogin(async ({ serviceName, serviceData }) => {
    const email = normalizeExternalServiceData(serviceName, serviceData);
    return email ? Accounts.findUserByEmail(email) : undefined;
  });

  Accounts.validateNewUser((user) => {
    const serviceName = oauthServiceNameForUser(user);
    if (!serviceName) return true;

    const email = emailFromUserAccount(user);
    if (!email) throw new Meteor.Error('oauth-email-required', 'OAuth account email is required.');
    return true;
  });

  Accounts.onCreateUser((options, user) => {
    const serviceName = oauthServiceNameForUser(user);
    const email = emailFromUserAccount(user);
    const nextUser = {
      ...user,
      profile: options.profile || user.profile,
    };

    if (serviceName && email && !nextUser.emails?.length) {
      nextUser.emails = [buildEmailRecord(serviceName, nextUser.services[serviceName], email)];
    }

    return nextUser;
  });
}

configureOAuthAccounts();
