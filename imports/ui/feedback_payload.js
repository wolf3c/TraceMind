export const FEEDBACK_KIND_OPTIONS = [
  { value: "issue", label: "Issue" },
  { value: "idea", label: "Idea" },
  { value: "question", label: "Question" },
  { value: "other", label: "Other" },
];

const VALID_FEEDBACK_KINDS = new Set(FEEDBACK_KIND_OPTIONS.map((option) => option.value));
const FORBIDDEN_FEEDBACK_PATTERN = new RegExp([
  String.raw`\b(bearer\s+\S+|api[_-]?key|access[_-]?token|secret[_-]?token)\b`,
  `${["s", "k-"].join("")}[A-Za-z0-9_-]{12,}`,
  ["raw", String.raw`\s+`, "prompt"].join(""),
  ["raw", String.raw`\s+`, "user", String.raw`\s+`, "content"].join(""),
  ["source", String.raw`\s+`, "diff"].join(""),
  ["code", String.raw`\s+`, "diff"].join(""),
  ["request", String.raw`\s+`, "body"].join(""),
  ["response", String.raw`\s+`, "body"].join(""),
  ["authorization", String.raw`\s*:`].join(""),
  ["set-cookie", String.raw`\s*:`].join(""),
  ["tool", String.raw`\s+`, "arguments?"].join(""),
  ["tool", String.raw`\s+`, "results?"].join(""),
  ["resource", String.raw`\s+`, "content"].join(""),
].join("|"), "i");
const FULL_QUERY_URL_PATTERN = /https?:\/\/[^\s?#]+[^\s]*\?[^\s"'<>)]*/i;
const CONTACT_EMAIL_PATTERN = new RegExp(
  ["^", String.raw`[^\s@]+`, "@", String.raw`[^\s@]+`, String.raw`\.`, String.raw`[^\s@]+`, "$"].join(""),
);

export const FEEDBACK_ERRORS = {
  emptyBody: "Add a short description before submitting feedback.",
  sensitiveContent: "Remove sensitive credentials or full URLs with query strings before submitting.",
  invalidContactAddress: "Enter a valid contact email or turn off contact consent.",
};

function trimText(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

export function normalizeFeedbackKind(value) {
  const kind = trimText(value, 20).toLowerCase();
  return VALID_FEEDBACK_KINDS.has(kind) ? kind : "other";
}

export function feedbackContainsForbiddenContent(...values) {
  return values
    .map((value) => String(value || ""))
    .some((value) => FORBIDDEN_FEEDBACK_PATTERN.test(value) || FULL_QUERY_URL_PATTERN.test(value));
}

export function normalizeFeedbackContact({ contactConsent = false, contactAddress = "" } = {}) {
  const email = trimText(contactAddress, 160);
  if (!contactConsent) return { ok: true, contact: { consent: false } };
  if (email && !CONTACT_EMAIL_PATTERN.test(email)) {
    return { ok: false, error: FEEDBACK_ERRORS.invalidContactAddress };
  }
  return {
    ok: true,
    contact: {
      consent: true,
      ...(email ? { email } : {}),
    },
  };
}

export function buildFeedbackMessage({
  kind = "issue",
  title = "",
  body = "",
  contactConsent = false,
  contactAddress = "",
} = {}) {
  const normalizedTitle = trimText(title, 160);
  const normalizedBody = trimText(body, 4000);

  if (!normalizedBody) {
    return { ok: false, error: FEEDBACK_ERRORS.emptyBody };
  }
  if (feedbackContainsForbiddenContent(normalizedTitle, normalizedBody)) {
    return { ok: false, error: FEEDBACK_ERRORS.sensitiveContent };
  }

  const contactResult = normalizeFeedbackContact({ contactConsent, contactAddress });
  if (!contactResult.ok) return contactResult;

  return {
    ok: true,
    message: {
      formatVersion: 1,
      kind: normalizeFeedbackKind(kind),
      title: normalizedTitle,
      body: normalizedBody,
      contact: contactResult.contact,
      fields: {},
      attachments: [],
    },
  };
}
