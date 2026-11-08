import { get, writable } from "svelte/store";

export type Locale = "en" | "ru";
type Messages = Record<string, any>;

export const locale = writable<Locale>("en");
export const translations = writable<Messages>({});

let english: Messages = {};
let initialized = false;
let loading: Promise<void> | null = null;

function mergeMessages(base: Messages, override: Messages): Messages {
    const result: Messages = { ...base };

    for (const key of Object.keys(override)) {
        const baseValue = result[key];
        const overrideValue = override[key];

        if (
            baseValue &&
            overrideValue &&
            typeof baseValue === "object" &&
            typeof overrideValue === "object" &&
            !Array.isArray(baseValue) &&
            !Array.isArray(overrideValue)
        ) {
            result[key] = mergeMessages(baseValue, overrideValue);
        } else {
            result[key] = overrideValue;
        }
    }

    return result;
}

async function loadDictionary(lang: Locale): Promise<Messages> {
    const response = await fetch(`/locales/${lang}.json`, {
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(`Cannot load locale "${lang}": HTTP ${response.status}`);
    }

    return response.json();
}

export async function setLocale(lang: Locale): Promise<void> {
    if (lang !== "en" && lang !== "ru") {
        lang = "en";
    }

    if (!Object.keys(english).length) {
        english = await loadDictionary("en");
    }

    let selected: Messages = {};

    if (lang === "ru") {
        try {
            selected = await loadDictionary("ru");
        } catch (error) {
            console.error("Failed to load Russian translations:", error);
        }
    }

    translations.set(mergeMessages(english, selected));
    locale.set(lang);

    if (typeof localStorage !== "undefined") {
        localStorage.setItem("reaggie-locale", lang);
    }

    initialized = true;
}

export async function initI18n(): Promise<void> {
    if (initialized) return;
    if (loading) return loading;

    loading = (async () => {
        let preferred: Locale = "en";

        if (typeof localStorage !== "undefined") {
            const saved = localStorage.getItem("reaggie-locale");
            if (saved === "ru" || saved === "en") {
                preferred = saved;
            }
        }

        try {
            await setLocale(preferred);
        } catch (error) {
            console.error("Failed to initialize translations:", error);
            translations.set({});
        }
    })();

    try {
        await loading;
    } finally {
        loading = null;
    }
}

export function t(key: string, messages: Messages = get(translations)): string {
    const value = key.split(".").reduce<any>((current, part) => {
        return current && typeof current === "object"
            ? current[part]
            : undefined;
    }, messages);

    return typeof value === "string" ? value : key;
}
