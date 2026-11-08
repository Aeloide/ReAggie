import { writable } from "svelte/store";
import { clamp } from "../../utils";

function loadFromLocalStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return;
  }
}

function setLocalStorage(key: string, value: string | number) {
  try {
    localStorage.setItem(key, "" + value);
  } catch (e) {
    return;
  }
}

export function loadFloatSetting(key: string, fallback: number) {
  let f = parseFloat(loadFromLocalStorage(key)!);
  return Number.isNaN(f) ? fallback : f;
}

type SettingsObject<T> = {
  [K in keyof T]: T[K] extends [string, infer U, ...any]
  ? U extends (...args: any) => any
  ? ReturnType<U>
  : never
  : T[K];
};

function createProxy<T>(params: T) {
  const ret: any = {};
  const setters: any = {};
  for (let p in params) {
    const o = params[p] as any;
    if (Array.isArray(params[p])) {
      switch (o[1]) {
        case String:
          ret[p] = o[0] in localStorage ? loadFromLocalStorage(o[0]) : o[2];
          break;
        case Number:
          ret[p] = clamp(loadFloatSetting(o[0], o[3]), o[2][0], o[2][1]);
          break;
        case Object:
          try {
            ret[p] = JSON.parse(loadFromLocalStorage(o[0]) || "null") || o[2];
          } catch {
            ret[p] = o[2];
          }
          break;
        case Boolean:
          ret[p] = o[0] in localStorage ? loadFromLocalStorage(o[0]) === "y" : o[2];
          break;
        default:
          ret[p] = o[1](loadFromLocalStorage(o[0]) || o[2]);
      }
      setters[p] = (v: any) => {
        const key = (params[p] as any)[0] as string;
        const value = typeof v == "boolean" ? (v ? "y" : "") : v;
        if (typeof v === "object")
          setLocalStorage(key, JSON.stringify(value));
        else
          setLocalStorage(key, value);
      };
    } else {
      ret[p] = o[1]; // default value
      try {
        ret[p] = loadFromLocalStorage(params[p] as string);
      } catch { }
      setters[p] = (v: any) => {
        if (typeof v == "string") {
          setLocalStorage(params[p] as string, v);
        } else {
          setLocalStorage(params[p] as string, JSON.stringify(v));
        }
      };
    }
  }
  return new Proxy(ret, {
    set(target, p, newValue, receiver) {
      target[p] = newValue;
      setters[p](newValue);

      // Synchronization logic
      // Synchronization logic
      if (p === "savedname") {
        if (target["selected_token"]) {
          const tokens = target["tokens"] as any[];
          const idx = tokens.findIndex((t: any) => t.val === target["selected_token"]);
          if (idx !== -1) {
            tokens[idx].username = newValue;
            setters["tokens"](tokens);
          }
        }
      } else if (p === "savedcolor") {
        if (target["selected_token"]) {
          const tokens = target["tokens"] as any[];
          const idx = tokens.findIndex((t: any) => t.val === target["selected_token"]);
          if (idx !== -1) {
            tokens[idx].color = newValue;
            setters["tokens"](tokens);
          }
        }
      } else if (p === "selected_token") {
        if (newValue) {
          const tokens = target["tokens"] as any[];
          const token = tokens.find((t: any) => t.val === newValue);
          if (token) {
            if (token.username) {
              target["savedname"] = token.username;
              setters["savedname"](token.username);
            }
            if (token.color) {
              target["savedcolor"] = token.color;
              setters["savedcolor"](token.color);
            }
          }
        }
      }

      return true;
    },
  }) as SettingsObject<T>;
}

const t = <T extends any[]>(...args: T): T => args;

const getArgs = (roomName: string) => {
  return {
    mutesound: "mutesounds",
    mutechat: "mutechat",
    imblind: "imblind",
    mutejuke: "mutejuke",
    jukevol: t("jukevol", Number, [0, 1], 1),
    hideusers: "hideuser",
    hidechat: "hidechat",
    hidenametags: "hidenametags",
    piecePickMode: t("pick", String, "hold"),
    previewScale: t("preview-scale", Number, [0.5, 4], 1),
    viewsVar: t("views", Object, {}),
    enableTimer: "timer",
    renderer: t("renderer", String, "gpu4"),
    secretforthisroom: t(
      localStorage["adminsecret"] || `secret:${roomName}`,
      String,
      localStorage["adminsecret"] || ""
    ),
    helpDismissed: "help-dismissed",
    savedbgcol: t("bg", String, "#222222"),
    savedbgtexture: t("bg-texture", String, "none"),
    savedname: t("name", String, ""),
    savedcolor: t("color", String, "#ff5bb6"),
    antialias: t("antialias", Number, [0, 8], 4),
    particle: t("particle", Number, [0, 10], 0),
    nsfw: t("nsfw", Boolean, false),
    publicRoomsView: t("public-rooms-view", String, "grid"),
    hideshadow: t("hideshadow", Boolean, false),
    hideosc: t("hideosc", Boolean, false),
    tokens: t("tokens", Object as (v: any) => { name: string, val: string; username?: string; color?: string }[], []),
    selected_token: "selected_token" as string | null,
    direct: t("direct", Boolean, true),
    forcedesync: t("forcedesync", Boolean, false),
    gamingmode: t("gamingmode", Boolean, false),
    default_follow_rights: t("default_follow_rights", Number, [0, 15], 0),
    trustees: t("trustees", Object as (v: any) => { id?: string; userId: number; userName: string; timestamp: number; }[], []),
    followers: t("followers", Object as (v: any) => { id?: string; userId: number; userName: string; timestamp: number; }[], []),
    following: t("following", Object as (v: any) => { id?: string; userId: number; userName: string; timestamp: number; }[], []),
    mutelist: t("mutelist", Object as (v: any) => { id?: string; userId?: number; userName?: string; type: 'asn' | 'ip'; range?: 'exact' | 'narrow' | 'large'; timestamp: number; }[], []),
    pending_mute_commands: t("pending_mute_commands", Object as (v: any) => { action: 'mute' | 'unmute'; userId?: number; userName?: string; type?: 'asn' | 'ip'; range?: 'exact' | 'narrow' | 'large'; timestamp: number; }[], []),
    bingotoken: t("bingotoken", String, ""),
    shadowQuality: t("shadowQuality", String, "accurate"),
    shadowLightPos: t("shadowLightPos", Object, { x: 0, y: 0, angle: 0, magnitude: 0, spread: 1 }),
    persistentShadowGizmo: t("persistentShadowGizmo", Boolean, false)
  };
};

function createSettings(roomName: string) {
  return createProxy(getArgs(roomName)) as SettingsObject<
    ReturnType<typeof getArgs>
  >;
}

export function createSettingsStore() {
  const store = writable(createSettings(""));
  const { subscribe, set, update } = store;

  let settingsSnapshot: ReturnType<typeof createSettings>;
  subscribe((x) => (settingsSnapshot = x));

  return {
    subscribe,
    set,
    update,
    snapshot: () => settingsSnapshot,
    init: (roomName: string, roomSecret?: string) => {
      const settings = createSettings(roomName);
      if (roomSecret) {
        settings.secretforthisroom = roomSecret;
      }
      set(settings);
    }
  };
}
