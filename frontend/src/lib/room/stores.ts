import { writable, get, derived, type Writable } from "svelte/store";
import { type RoomState, type ChatMessage, type JukeboxState, type JukeBoxSongPlayRequest, type GameStatus, type BgColorPickerState, type GamePoll, type EmoteMessage } from "./types";
import type { Room, track } from "$room/types";
import { createSettingsStore } from "./settingsStore";
import { createNameTagsStore } from "./nameTagsStore";
import { chatsound, discordsound, playsound } from "$room/audio";
import { game } from "$room";

export const unreadNotifications = writable(0);

let originalFavicons = new Map<HTMLLinkElement, string>();
const updateFavicon = (count: number) => {
  if (typeof document === "undefined") return;

  if (originalFavicons.size === 0) {
    const links = document.querySelectorAll("link[rel='icon']") as NodeListOf<HTMLLinkElement>;
    links.forEach((l) => originalFavicons.set(l, l.href));
  }

  if (count === 0) {
    originalFavicons.forEach((href, link) => link.href = href);
    return;
  }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = [...originalFavicons.values()][0];
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    ctx.drawImage(img, 0, 0, 32, 32);

    // Draw red circle
    ctx.beginPath();
    ctx.arc(20, 20, 10, 0, 2 * Math.PI);
    ctx.fillStyle = "#ff0000";
    ctx.fill();

    // Draw text
    ctx.fillStyle = "white";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = count > 9 ? "+" : count.toString();
    ctx.fillText(text, 20, 21);

    const links = document.querySelectorAll("link[rel*='icon']") as NodeListOf<HTMLLinkElement>;
    links.forEach((l) => l.href = canvas.toDataURL("image/png"));
  };
};

if (typeof window !== "undefined") {
  const reset = () => {
    if (document.visibilityState === "visible" && document.hasFocus()) {
      unreadNotifications.set(0);
      updateFavicon(0);
    }
  };
  window.addEventListener("focus", reset);
  document.addEventListener("visibilitychange", reset);
  window.addEventListener("click", reset);
}

const checkAndIncrementNotification = () => {
  if (typeof document !== "undefined" && !document.hasFocus()) {
    unreadNotifications.update((n) => {
      const newVal = n + 1;
      updateFavicon(newVal);
      return newVal;
    });
  }
};

export const settings = createSettingsStore();

import { HostCapabilities, Permissions, parsePermissionsToken } from "$lib/room/permissions";
import type { User } from "$room/game";
import { scratchCard } from "./scratch-card/scratchCardStore";
import { isMobileQuery } from "$lib/utils";

const buildHostProps = (perms: Permissions): Record<keyof typeof HostCapabilities, boolean> => {
  const ret = {} as Record<keyof typeof HostCapabilities, boolean>;
  for (const key of Object.keys(HostCapabilities) as (keyof typeof HostCapabilities)[]) {
    if (isNaN(+key)) { // Filter out numeric keys if enum reverse mapping exists (though string keys are what we want)
      ret[key] = perms.has(key);
    }
  }
  return ret;
};

export const otherSettings = writable({
  host: buildHostProps(parsePermissionsToken(settings.snapshot().secretforthisroom))
});

export let otherSettingsSnapshot: Parameters<Parameters<typeof otherSettings['subscribe']>[0]>[0];

otherSettings.subscribe(v => {
  otherSettingsSnapshot = v;
});

settings.subscribe(s => {
  otherSettings.set({
    host: buildHostProps(parsePermissionsToken(settings.snapshot().secretforthisroom))
  });
});

export const jukebox = (() => {
  const emptyState: JukeboxState = {
    minprice: 0,
    qty: 0,
  };

  const store = writable<JukeboxState>(emptyState);

  return {
    subscribe: store.subscribe,
    setMinPrice: (minprice: number) => store.update((x) => ({ ...x, minprice })),
    setQty: (qty: number) => store.update((x) => ({ ...x, qty })),
    reset: () => store.set(emptyState),
  };
})();

export const jukeboxSongRequest = (() => {
  const store = writable<JukeBoxSongPlayRequest | undefined>(undefined);

  return {
    subscribe: store.subscribe,
    stop: () => store.set(undefined),
    set: (songRequest: JukeBoxSongPlayRequest) => {
      const curState = get(store);
      // prevent setting an older state
      // if (curState && songRequest.timeStarted < curState.timeStarted) {
      //   return;
      // }
      store.set(songRequest);
    },
  };
})();

export const playlist = writable<track[]>([]);

export type Process = {
  id: number;
  code: Writable<string>;
}

export const processes = writable<Process[]>([]);

export const chatLog = (() => {
  const store = writable<(ChatMessage | EmoteMessage)[]>([]);

  let pendingMessages: (ChatMessage | EmoteMessage)[] = [];
  let pendingTimeout: ReturnType<typeof setTimeout> | undefined;

  // debounce messages to avoid frequent updates
  const scheduleAddMessage = (message: ChatMessage | EmoteMessage) => {
    pendingMessages.push(message);

    clearTimeout(pendingTimeout);
    pendingTimeout = setTimeout(() => {
      store.update((x) => [...x, ...pendingMessages]);
      pendingMessages = [];
      pendingTimeout = undefined;
    }, 50);
  };

  return {
    subscribe: store.subscribe,
    addEmote: (emotes: EmoteMessage) => {
      // they don't make sounds
      scheduleAddMessage(emotes);
    },
    addMessage: (message: ChatMessage) => {
      const allCurrentUsers = get(users);
      const myPlayerId = game.connection?.playerId;
      const myUser = allCurrentUsers.find(u => u.id === myPlayerId); // Assumes User type has 'id'
      const curSettings = settings.snapshot();

      let isPrivateMessageProcessed = false;

      // Case 1: I sent this whisper
      const ms = message.name.match(/\(to (.*)\)$/);

      if (ms) {
        const recipientNameInWhisper = ms[1]
        if (myUser && message.id === myUser.id) {
          const recipientUser = allCurrentUsers.find(u => u.name.toLowerCase() === recipientNameInWhisper.toLowerCase());
          if (recipientUser) {
            // privateConversations.processPrivateMessage(message, myUser.id, recipientUser.id);
            // Consider a specific sound for sent PM, or rely on server echo if any
            // playsound(discordsound); // Using discordsound as a generic PM notification
            isPrivateMessageProcessed = true;
          }
        }

      }

      if (message.name.startsWith('(whisper) ')) {
        const recipientNameInWhisper = message.name.slice(10).trim(); // Remove "(whisper) "

        // Case 2: I am the recipient of this whisper. `message.id` is the sender.
        // `message.name` starts with `(whisper) MyActualName`
        if (myUser) {
          const senderUser = allCurrentUsers.find(u => u.id === message.id);
          if (senderUser) {
            // Create a slightly modified message for display in private chat,
            // so `name` is the sender's actual name, not "(whisper)..."
            const actualMessageFromSender: ChatMessage = {
              timeStamp: Date.now(),
              ...message,
              // name: senderUser.name, // The PrivateChatMessageDisplay will handle showing sender's name
            };
            privateConversations.processPrivateMessage(actualMessageFromSender, senderUser.id, myUser.id);
            playsound(discordsound); // Sound for received PM
            checkAndIncrementNotification();
            isPrivateMessageProcessed = true;
          }
        }
      }

      if (isPrivateMessageProcessed) {
        return; // Private message handled, do not add to public chat
      }

      if (message.id !== game.connection?.playerId && !curSettings.hidechat && !curSettings.mutechat) {
        // hack, would be better if the backend could indicate it's a whisper/@
        let sound: AudioBuffer = chatsound;
        if (message.name.startsWith('(whisper) ')) {
          const basename = message.name.slice(10);
          const userlist = get(users);
          if (userlist.some(u => u.name.toLowerCase() === basename.toLowerCase())) {
            sound = discordsound;
          }
        } else if (message.message.includes('@')) {
          let { savedname } = get(settings);
          savedname = savedname.toLowerCase();
          if (message.message.toLowerCase().includes('@' + savedname)) {
            sound = discordsound;
            checkAndIncrementNotification();
          }
        }
        playsound(sound);
      }

      scheduleAddMessage(message);
    },
    clear: () => {
      pendingMessages = [];
      clearTimeout(pendingTimeout);
      pendingTimeout = undefined;
      store.set([]);
    },
  };
})();

export type FollowRequest = {
  rid: string;
  origin: number,
  events: number;
}

export const followReqs = (() => {
  const store = writable<FollowRequest[]>([]);

  let pendingReqs: FollowRequest[] = [];
  let pendingTimeout: ReturnType<typeof setTimeout> | undefined;

  // debounce messages to avoid frequent updates
  const scheduleAddReq = (reques: FollowRequest) => {
    pendingReqs.push(reques);

    clearTimeout(pendingTimeout);
    pendingTimeout = setTimeout(() => {
      store.update((x) => [...x, ...pendingReqs]);
      pendingReqs = [];
      pendingTimeout = undefined;
    }, 50);
  };

  return {
    subscribe: store.subscribe,
    addRequest: (message: FollowRequest) => {
      const curSettings = settings.snapshot();
      // playsound(chatsound);
      if (message.events === 0) { // request to stop following: automatically accept these
        game.connection.chat(`/acceptfollowrequest ${message.rid}`)
        return;
      }

      // Auto-accept if requested events are subset of default follow rights
      const defaultRights = curSettings.default_follow_rights || 0;

      if (defaultRights !== 0 && (message.events & defaultRights) === message.events) {
        // All requested events are covered by default rights, auto-accept
        game.connection.chat(`/acceptfollowrequest ${message.rid}`);

        // Add to followers list
        const allUsers = get(users);
        const requester = allUsers.find(u => u.id === message.origin);
        if (requester) {
          settings.update(s => {
            const followers = s.followers || [];
            const alreadyFollower = followers.some(f => f.userId === message.origin);
            if (!alreadyFollower) {
              s.followers = [...followers, {
                userId: message.origin,
                userName: requester.name,
                timestamp: Date.now()
              }];
            }
            return s;
          });
        }

        return;
      }

      scheduleAddReq(message);
    },
    dismiss: (r: FollowRequest) => {
      store.update(s => {
        return s.filter(e => e.rid != r.rid);
      });
    },
    clear: () => {
      pendingReqs = [];
      clearTimeout(pendingTimeout);
      pendingTimeout = undefined;
      store.set([]);
    },
  };
})();

export const users = (() => {
  const { subscribe, set } = writable<User[]>([]);
  return {
    subscribe,
    set,
    reset: () => set([]),
  };
})();

export const heldPieces = (() => {
  const store = writable<Map<number, number>>(new Map());
  return {
    ...store,
    reset: () => store.set(new Map()),
  };
})();

export const nameTags = createNameTagsStore();

export type EndStats = {
  ranking: [string, number][],
  jcfav?: string;
  deadweight?: string;
};

export const roomDef = (() => {
  const store = writable<Room | undefined>();
  return {
    subscribe: store.subscribe,
    reset: () => store.set(undefined),
    set: (room: Room) => store.set(room),
  };
})();

export const endStats = (() => {
  const store = writable<EndStats>();
  return {
    subscribe: store.subscribe,
    reset: () => store.set({ ranking: [] }),
    set: (st: EndStats) => store.set(st),
  };
})();

export const gameStatus = (() => {
  const store = writable<GameStatus>({ status: "connecting" });
  return {
    subscribe: store.subscribe,
    set: (newStatus: GameStatus) => {
      store.update((prev) => {
        if (prev.status === newStatus.status && newStatus.status === "error") {
          return {
            ...newStatus,
            text: [prev.text, newStatus.text].filter((x) => x).join(", "),
          };
        }

        return newStatus;
      });
    },
  };
})();

export const roomState = (() => {
  const defaultStoreValue = (): RoomState => ({
    lockedPiecesCount: 0,
    donePercent: 0,
    timerText: "",
    isCompleted: false,
  });

  const store = writable<RoomState>(defaultStoreValue());
  return {
    ...store,
    reset: () => store.set(defaultStoreValue()),
    markAsCompleted: () => {
      store.update((x) => ({ ...x, isCompleted: true }));
    },
    setCompleted: (completed: boolean) => {
      store.update((x) => ({ ...x, isCompleted: completed }));
    },
  };
})();

export const videoElements = (() => {
  const store = writable<Map<string, HTMLVideoElement>>(new Map());
  return {
    subscribe: store.subscribe,
    reset: () => store.set(new Map()),
    addElements: (elements: HTMLVideoElement[]) => {
      store.update((x) => {
        elements.forEach((element) => x.set(element.src, element));
        return x;
      });
    },
    getProgress: (url: string) => {
      const element = get(store).get(url);
      return element?.currentTime ?? 0;
    },
  };
})();

export const bgColorPicker = (() => {
  const store = writable<BgColorPickerState>({
    visible: false,
  });

  return {
    subscribe: store.subscribe,
    showPicker: (color: string, texture: string) => {
      store.update((x) => ({ ...x, visible: true, color, texture }));
    },
    hidePicker: () => store.update((x) => ({ ...x, visible: false })),
  };
})();

export const driftStore = writable<number | undefined>();
export const pollStore = writable<GamePoll>({ zones: [] });
export const jigChanStore = writable<{
  myjc?: number;
  cake: number;
  pat: boolean;
}>({
  cake: 0,
  pat: false
});

export const bugStore = writable<{
  spawn: boolean;
  spawnchuu: boolean
}>({
  spawn: false,
  spawnchuu: false,
});

import type { Note } from "$room/types";
export const notesStore = writable<{
  notes: Note[]
}>({
  notes: []
});

export const resetRoomStores = () => {
  jukebox.reset();
  jukeboxSongRequest.stop();
  playlist.set([]);
  chatLog.clear();
  users.reset();
  heldPieces.reset();
  nameTags.reset();
  roomDef.reset();
  endStats.reset();
  roomState.reset();
  processes.set([]);
  followReqs.clear();
  videoElements.reset();
  bgColorPicker.hidePicker();
  driftStore.set(undefined);
  pollStore.set({ zones: [] });
  notesStore.set({ notes: [] });
  jigChanStore.set({ cake: 0, pat: false });
  bugStore.set({ spawn: false, spawnchuu: false });
  scratchCard.reset();
};

export interface PrivateConversation {
  id: string; // Unique ID for the conversation, e.g., `user-${userId}`
  withUser: User; // The other user in this private chat
  messages: (ChatMessage | EmoteMessage)[];
  isMinimized: boolean;
  unread: number;
}

export const privateConversations = (() => {
  const store = writable<PrivateConversation[]>([]);
  const { subscribe, update, set } = store;

  const addMessageToConversation = (otherUser: User, message: ChatMessage | EmoteMessage) => {
    update(conversations => {
      let conversation = conversations.find(c => c.withUser.id === otherUser.id);
      let newConversationsArray = [...conversations];
      const isMobile = get(isMobileQuery())
      if (conversation) {
        conversation.messages = [...conversation.messages, message];
        if (!conversation.unread)
          conversation.unread = 0;
        conversation.unread += +(conversation.isMinimized || (isMobile && get(activeMobilePrivateChatUserId) != conversation.withUser.id));
        // conversation.isMinimized = false; // Unminimize and bring to front on new message
        // Move to the end of the array (will be right-most with flex-direction: row)
        // newConversationsArray = newConversationsArray.filter(c => c.withUser.id !== otherUser.id);
        // newConversationsArray.push(conversation);
      } else {
        // Optional: Enforce MAX_PRIVATE_CHATS by removing the oldest (left-most) if limit is reached
        conversation = {
          id: `user-${otherUser.id}`,
          withUser: otherUser,
          messages: [message],
          isMinimized: false,
          unread: 0
        };
        newConversationsArray.push(conversation);
      }
      return newConversationsArray;
    });
  };

  return {
    subscribe,
    set, // Used for drag-and-drop reordering
    processPrivateMessage: (message: ChatMessage | EmoteMessage, actualSenderId: number, intendedRecipientId?: number) => {
      const allUsers = get(users); // Assuming 'users' is your existing Svelte store for user list
      const myPlayerId = game.connection?.playerId; // Your player ID from game store
      let otherParticipantUser: User | undefined;

      if (actualSenderId === myPlayerId && intendedRecipientId) {
        // I sent this message
        otherParticipantUser = allUsers.find(u => u.id === intendedRecipientId);
      } else if (intendedRecipientId === myPlayerId && actualSenderId !== myPlayerId) {
        // I received this message
        otherParticipantUser = allUsers.find(u => u.id === actualSenderId);
      } else {
        return; // Not a PM involving me or data is missing
      }

      if (otherParticipantUser) {
        addMessageToConversation(otherParticipantUser, message);
      }
    },

    closeConversation: (userIdToClose: number) => {
      update(convos => convos.filter(c => c.withUser.id !== userIdToClose));
    },

    toggleMinimizeConversation: (userIdToToggle: number) => {
      update(convos =>
        convos.map(c =>
          c.withUser.id === userIdToToggle ? { ...c, isMinimized: !c.isMinimized, unread: c.isMinimized ? 0 : c.unread } : c
        )
      );
    },

    clearUnread: (userIdToClear: number) => {
      update(convos => {
        const match = convos.find(e => e.withUser.id === userIdToClear);
        if (match)
          match.unread = 0;
        return convos;
      })
    },

    startConversationWithUser: (targetUser: User) => {
      update(conversations => {
        let conversation = conversations.find(c => c.withUser.id === targetUser.id);
        let newArray = [...conversations];
        if (conversation) {
          conversation.isMinimized = false;
          newArray = newArray.filter(c => c.withUser.id !== targetUser.id);
          newArray.push(conversation); // Move to end (right-most)
        } else {
          const newConversation: PrivateConversation = {
            id: `user-${targetUser.id}`,
            withUser: targetUser,
            messages: [],
            isMinimized: false,
            unread: 0,
          };
          newArray.push(newConversation);
        }
        return newArray;
      });
    }
  };
})();


export const activeMobilePrivateChatUserId = writable<number | null>(null);

activeMobilePrivateChatUserId.subscribe(s => {
  if (s !== null)
    privateConversations.clearUnread(s)
})