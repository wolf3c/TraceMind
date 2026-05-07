import { derived, get, writable } from "svelte/store";

const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = ["en", "zh"];
const DOCUMENT_LANG_MAP = {
  en: "en",
  zh: "zh-CN",
};

const localeStore = writable(DEFAULT_LOCALE);
const dictionaryStore = writable({});
const loadingByLocale = new Map();

export const normalizeLocaleValue = (value = "") => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return DEFAULT_LOCALE;
  const base = raw.split("-")[0];
  return SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
};

const pickLocale = (value = "") => {
  if (!value) return null;
  return normalizeLocaleValue(value);
};

const resolveInitialLocale = () => {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const queryLocale = pickLocale(
    new URLSearchParams(window.location.search).get("lang"),
  );
  if (queryLocale) return queryLocale;

  const storedLocale = pickLocale(window.localStorage?.getItem("lang"));
  if (storedLocale) return storedLocale;

  return normalizeLocaleValue(window.navigator?.language);
};

const applyLocaleSideEffects = (nextLocale = DEFAULT_LOCALE) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang =
      DOCUMENT_LANG_MAP[nextLocale] || DOCUMENT_LANG_MAP[DEFAULT_LOCALE];
  }

  if (typeof window !== "undefined") {
    window.localStorage?.setItem("lang", nextLocale);
  }
};

const mergeDictionary = (locale, messages = {}) => {
  dictionaryStore.update((current) => ({
    ...current,
    [locale]: messages,
  }));
};

const loadLocaleMessages = (targetLocale = DEFAULT_LOCALE) => {
  const nextLocale = normalizeLocaleValue(targetLocale);
  const dictionary = get(dictionaryStore);
  if (dictionary[nextLocale]) return Promise.resolve(dictionary[nextLocale]);

  const loading = loadingByLocale.get(nextLocale);
  if (loading) return loading;

  const loader =
    nextLocale === "zh"
      ? import("./locales/zh.js")
      : import("./locales/en.js");

  const loadPromise = loader
    .then((module) => {
      const messages = module.default || {};
      mergeDictionary(nextLocale, messages);
      return messages;
    })
    .finally(() => {
      loadingByLocale.delete(nextLocale);
    });

  loadingByLocale.set(nextLocale, loadPromise);
  return loadPromise;
};

const setLocaleInternal = async (targetLocale = DEFAULT_LOCALE) => {
  const nextLocale = normalizeLocaleValue(targetLocale);
  await loadLocaleMessages(nextLocale);
  localeStore.set(nextLocale);
  applyLocaleSideEffects(nextLocale);
  return nextLocale;
};

export const locale = {
  subscribe: localeStore.subscribe,
  set(nextLocale) {
    void setLocaleInternal(nextLocale);
  },
  update(updater) {
    const current = get(localeStore);
    void setLocaleInternal(updater(current));
  },
};

export const locales = [...SUPPORTED_LOCALES];

export const translateMessage = (messages = {}, key, vars = {}) => {
  let text = messages?.[key] ?? key;

  Object.keys(vars).forEach((name) => {
    const regex = new RegExp(`{{${name}}}`, "g");
    text = text.replace(regex, vars[name]);
  });

  return text;
};

export const t = derived([localeStore, dictionaryStore], ([$locale, $dicts]) => {
  const messages = $dicts?.[$locale] || {};
  return (key, vars = {}) => translateMessage(messages, key, vars);
});

const bootLocale = resolveInitialLocale();
localeStore.set(bootLocale);
applyLocaleSideEffects(bootLocale);

void loadLocaleMessages(bootLocale).catch((error) => {
  console.error("[i18n] failed to load locale:", bootLocale, error);
  if (bootLocale === DEFAULT_LOCALE) return;
  localeStore.set(DEFAULT_LOCALE);
  applyLocaleSideEffects(DEFAULT_LOCALE);
  void loadLocaleMessages(DEFAULT_LOCALE).catch((fallbackError) => {
    console.error("[i18n] failed to load default locale:", fallbackError);
  });
});
