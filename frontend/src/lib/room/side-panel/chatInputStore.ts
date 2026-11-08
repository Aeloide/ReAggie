import { SearchIndex } from "emoji-mart";
import { derived, writable } from "svelte/store";
import { users } from "../stores";
import type { User } from "$room/game";

interface ChatInputState {
  visible: boolean;
  text: string;
}

interface Suggestion {
  id: string;
  word: string;
  emoji?: {
    native?: string;
    shortcodes: string;
  };
  user?: User;
}

export const chatInput = (() => {
  const defaultStateValue = (): ChatInputState => ({
    visible: false,
    text: "",
  });

  const state = writable<ChatInputState>(defaultStateValue());

  return {
    ...state,
    reset: () => state.set(defaultStateValue()),
    setVisible: (visible: boolean) => {
      state.update((x) => ({
        visible,
        text: visible ? x.text : "",
      }));
    },
    addEmoji: (emoji: Suggestion["emoji"]) => {
      const emojiTag = emoji!.native || emoji!.shortcodes;
      state.update((x) => ({
        ...x,
        text: `${x.text}${emojiTag}`,
      }));
    },
    applySuggestion: (suggestion: Suggestion) => {
      const { word, emoji, user } = suggestion;
      state.update((x) => {
        const textWithoutLastWord = x.text.slice(0, -word.length);

        let newText = "";
        if (emoji) {
          newText = emoji.native || emoji.shortcodes;
        } else if (user) {
          newText = "@" + user.name;
        }

        return {
          ...x,
          text: textWithoutLastWord + newText + " ",
        };
      });
    },
  };
})();

const lastWord = derived(chatInput, (x) => {
  const words = x.text.split(" ");
  if (words.length > 0) {
    const lastWord = words[words.length - 1];
    if (lastWord.length > 0) {
      return lastWord;
    }
  }

  return null;
});

export const suggestedEmojis = derived<typeof lastWord, Suggestion[]>(lastWord, (word, set) => {
  if (!word) {
    set([]);
    return;
  }

  const hasLeadingColon = word.length > 0 && word[0] === ":";
  if (!hasLeadingColon || word.length < 3) {
    set([]);
    return;
  }

  const wordToSearch = hasLeadingColon ? word.slice(1) : word;
  SearchIndex.search(wordToSearch, {
    maxResults: 6,
    caller: null,
  }).then((results: any[]) => {
    if (results.length === 0) {
      set([]);
      return;
    }

    const suggestions = results.map<Suggestion>((x) => ({
      id: x.id,
      word,
      emoji: x.skins[0],
    }));

    set(suggestions);
    return;
  });
});

export const suggestedUsers = derived([lastWord, users], ([word, users]) => {
  if (!word || !word.startsWith("@")) {
    return [] as Suggestion[];
  }

  const filteredUsers = users.filter((x) => !x.isMe && x.name.toLowerCase().startsWith(word.slice(1).toLowerCase()));
  return filteredUsers.map<Suggestion>((user) => ({ id: user.id.toString(), user, word }));
});
