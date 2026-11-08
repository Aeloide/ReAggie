<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { onDestroy, onMount, tick, afterUpdate } from "svelte";
  import { privateConversations, activeMobilePrivateChatUserId, type PrivateConversation, users } from "./stores"; // Adjust path
  import { slide } from "svelte/transition";
  import Fa from "svelte-fa";
  import { faArrowLeft, faFaceSmile, faPaperPlane } from "@fortawesome/free-solid-svg-icons";
  import { writable, derived, get } from "svelte/store";
  import { init as initEmojiMart, Picker as EmojiPicker, SearchIndex } from "emoji-mart";
  import Button from "$lib/components/ui/button/button.svelte"; // Adjust path
  import * as Popover from "$lib/components/ui/popover"; // Adjust path
  import { cn, flyAndScale } from "$lib/utils"; // Adjust path
  import { Combobox } from "bits-ui"; // Adjust path
  import PrivateChatMessageDisplay from "./PrivateChatMessageDisplay.svelte"; // Adjust path
  import customEmojisData from "./side-panel/emojis";
  import { useGame } from "./hooks/useGame";
  import { game } from "$room";
  import emojis from "../room/side-panel/emojis"; // Assuming this is your custom emoji definition file
  import type { User } from "$backend/types";

  let autoScroll = true;
  let currentConversation: PrivateConversation | undefined;
  const gameInstance = useGame();

  const unsubConversationStore = privateConversations.subscribe((convos) => {
    const activeId = get(activeMobilePrivateChatUserId);
    currentConversation = activeId !== null ? convos.find((c) => c.withUser.id === activeId) : undefined;
  });
  const inputText = writable("");

  const unsubActiveId = activeMobilePrivateChatUserId.subscribe((activeId) => {
    currentConversation = activeId !== null ? get(privateConversations).find((c) => c.withUser.id === activeId) : undefined;
    if (currentConversation) {
      autoScroll = true; // Reset autoscroll when conversation changes
      tick().then(() => scrollToBottom("auto"));
      tick().then(focusInput);
    }
  });

  const lastWord = derived(inputText, (x) => {
    const words = x.split(" ");
    if (words.length > 0) {
      const lastWord = words[words.length - 1];
      if (lastWord.length > 0) {
        return lastWord;
      }
    }

    return null;
  });

  interface Suggestion {
    id: string;
    word: string;
    emoji?: {
      native?: string;
      shortcodes: string;
    };
    user?: User;
  }

  const suggestedEmojisLocal2 = derived<typeof lastWord, Suggestion[]>(lastWord, (word, set) => {
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

  // --- Local state for this chat window's input (adapted from PrivateChatWindow) ---
  const isEmojiPickerUiOpen = writable(false);
  const isSuggestionsPopupOpen = writable(false);

  const isEmojiSuggestionsOpenLocal = derived(suggestedEmojisLocal2, ($sel) => $sel.length > 0);
  // --- End Local Input State ---

  let messagesContainer: HTMLDivElement;
  let inputTextArea: HTMLTextAreaElement;
  let emojiHolderDiv: HTMLDivElement;
  let suggestionItemsDivLocal: HTMLDivElement;
  const MAX_CHAT_INPUT_LENGTH = 300;

  function scrollToBottom(behavior: "smooth" | "auto" | "instant" = "smooth") {
    if (messagesContainer && autoScroll) {
      messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior });
    }
  }
  const suggestedUsersLocal = writable<Array<{ id: string; label: string; user: User }>>([]); // Empty for now

  const isUsersPickerOpenLocal = derived(suggestedUsersLocal, ($sul) => $sul.length > 0);

  afterUpdate(() => {
    // More reliable for DOM updates after data changes
    if (autoScroll && messagesContainer && currentConversation) {
      scrollToBottom("smooth");
    }
  });

  onMount(() => {
    initEmojiMart({ custom: customEmojisData });
    if (currentConversation) {
      autoScroll = true;
      tick().then(() => scrollToBottom("auto"));
      tick().then(focusInput);
    }
  });

  onDestroy(() => {
    unsubConversationStore();
    unsubActiveId();
  });

  const handleScroll = () => {
    if (!messagesContainer) return;
    const threshold = 150; // User has scrolled up significantly
    autoScroll = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
  };

  function closePanel() {
    activeMobilePrivateChatUserId.set(null);
  }

  async function focusInput() {
    if (!inputTextArea) return;
    await tick(); // Ensure textarea is rendered
    inputTextArea.focus();
  }

  function onSubmitMessage() {
    const text = get(inputText).trim();
    if (text && currentConversation && gameInstance.connection.isConnected) {
      gameInstance.connection.whisper(text, currentConversation.withUser.id);
      const allCurrentUsers = get(users);
      const myPlayerId = gameInstance.connection?.playerId;
      const myUser = allCurrentUsers.find((u) => u.id === myPlayerId)!; // Assumes User type has 'id'
      privateConversations.processPrivateMessage(
        { message: text, color: myUser.color, timeStamp: Date.now(), id: myPlayerId!, name: myUser.name },
        myUser.id,
        currentConversation.withUser.id,
      );
      inputText.set("");
      isSuggestionsPopupOpen.set(false);
      autoScroll = true;
      tick().then(() => scrollToBottom("smooth")); // Scroll after message is likely added
      focusInput();
    }
  }

  // --- Input Helper Functions (condensed - ensure these are fully implemented as in PrivateChatWindow) ---
  function applyLocalSuggestion(suggestionValue: string) {
    const currentText = get(inputText);
    let newText = currentText;
    const lastColon = currentText.lastIndexOf(":");
    if (lastColon > -1 && !currentText.substring(lastColon + 1).includes(" ")) {
      let suggestionToInsert = suggestionValue;
      const emojiSuggestion = get(suggestedEmojisLocal2).find((s) => s.id === suggestionValue);
      if (emojiSuggestion) suggestionToInsert = emojiSuggestion.emoji?.shortcodes || emojiSuggestion.emoji?.native || `:${emojiSuggestion.id}:`;
      newText = currentText.substring(0, lastColon) + suggestionToInsert + " ";
    } else {
      newText += suggestionValue + " ";
    }
    inputText.set(newText);
    isSuggestionsPopupOpen.set(false);
    focusInput();
  }
  function getHighlightedSuggestionLocal() {
    if (!suggestionItemsDivLocal) return null;
    const div = suggestionItemsDivLocal.querySelector("[data-highlighted]");
    const value = div?.getAttribute("data-value");
    if (!value) return null;
    if (get(isEmojiSuggestionsOpenLocal)) return get(suggestedEmojisLocal2).find((s) => s.id === value);
    return null;
  }
  function onInputKeyDownLocal(event: KeyboardEvent) {
    if (event.key === "Escape") {
      isSuggestionsPopupOpen.set(false);
      isEmojiPickerUiOpen.set(false);
      event.preventDefault();
      return;
    }
    const highlightedSuggestion = getHighlightedSuggestionLocal();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (highlightedSuggestion && get(isSuggestionsPopupOpen)) {
        applyLocalSuggestion(highlightedSuggestion.id);
      } else {
        onSubmitMessage();
      }
      return;
    }
    if (event.key === "Tab" && get(isSuggestionsPopupOpen)) {
      event.preventDefault();
      if (highlightedSuggestion) {
        applyLocalSuggestion(highlightedSuggestion.id);
      } else {
        const firstEmojiSugg = get(suggestedEmojisLocal2)[0];
        if (firstEmojiSugg) applyLocalSuggestion(firstEmojiSugg.id);
      }
      return;
    }
  }
  function onComboboxSelectedChange(selectedItemValue: string | undefined) {
    if (!selectedItemValue) return;
    applyLocalSuggestion(selectedItemValue);
    setTimeout(focusInput, 0);
  }

  const buildEmojiList = (spec: [id: string, ...keywords: string[]][]) =>
    spec.map((s) => ({
      id: s[0],
      name: s[0],
      keywords: s[1],
      skins: [{ src: `/${s[0]}.webp` }],
    }));

  const custom = [
    {
      id: "gifs",
      name: "GIFs", // webp ackshually, chud
      emojis: buildEmojiList(emojis),
    },
  ];

  async function showEmojiPickerUi() {
    if (!emojiHolderDiv || !get(isEmojiPickerUiOpen)) return;

    // Clear previous picker if any
    while (emojiHolderDiv.firstChild) {
      emojiHolderDiv.removeChild(emojiHolderDiv.firstChild);
    }

    const picker = new EmojiPicker({
      previewPosition: "none",
      autoFocus: true,
      custom,
      emojiButtonSize: 28,
      emojiSize: 20,
      perLine: 10, // Adjust as per your ChatInput styling
      theme: "dark", // Or "light"
      onEmojiSelect: (emoji: any) => {
        let currentVal = get(inputText);
        // emoji-mart v15+ returns emoji with .native for the character
        const char = emoji.native || emoji.shortcodes; // emoji.id might be shortcode like :+1:
        inputText.set(currentVal + char);
        isEmojiPickerUiOpen.set(false);
        focusInput();
      },
    });
    await tick();
    emojiHolderDiv.replaceChildren(picker as unknown as Node);
  }
  $: if (get(isEmojiPickerUiOpen) && emojiHolderDiv) {
    showEmojiPickerUi();
  }
  // --- End Input Helper Functions ---
</script>

{#if currentConversation}
  <div
    class="mobile-private-chat-side-panel fixed inset-0 bg-neutral-900 text-white z-[200] flex flex-col"
    transition:slide={{ axis: "x", duration: 250 }}>
    <header class="bg-neutral-800 p-3 flex items-center shadow-md sticky top-0">
      <button on:click={closePanel} class="mr-3 -ml-1 p-2 hover:bg-neutral-700 rounded-full" aria-label={t("chat.back", $translations)}>
        <Fa icon={faArrowLeft} size="lg" />
      </button>
      <div class="flex-grow overflow-hidden">
        <h2 class="font-semibold text-lg truncate" style="color: {currentConversation.withUser.color || 'white'}">
          {currentConversation.withUser.name}
        </h2>
      </div>
    </header>

    <div class="messages-area flex-grow overflow-y-auto p-3 space-y-2 custom-scrollbar-mobile" bind:this={messagesContainer} on:scroll={handleScroll}>
      {#each currentConversation.messages as msg (("timeStamp" in msg && msg.timeStamp) || JSON.stringify(msg))}
        <PrivateChatMessageDisplay {msg} conversationWithUser={currentConversation.withUser} />
      {/each}
    </div>

    <form class="chat-input-form p-2 border-t border-neutral-700 bg-neutral-800 sticky bottom-0" on:submit|preventDefault={onSubmitMessage}>
      <Combobox.Root bind:open={$isSuggestionsPopupOpen} onSelectedChange={(val) => onComboboxSelectedChange(val?.value)} portal={null}>
        <div class="relative flex items-center gap-2">
          <div class="flex-shrink-0">
            <Popover.Root bind:open={$isEmojiPickerUiOpen} portal={null}>
              <Popover.Trigger asChild let:builder>
                <Button
                  builders={[builder]}
                  size="icon"
                  variant="ghost"
                  class="w-9 h-9 rounded-full text-neutral-400 hover:text-neutral-100"
                  aria-label={t("chat.openEmoji", $translations)}>
                  <Fa icon={faFaceSmile} size="lg" />
                </Button>
              </Popover.Trigger>
              <Popover.Content class="p-0 w-auto bg-neutral-800 border-neutral-700 rounded-lg shadow-xl mb-1" side="top" align="start" sideOffset={5}>
                <div bind:this={emojiHolderDiv} />
              </Popover.Content>
            </Popover.Root>
          </div>
          <Combobox.Input asChild let:builder>
            <textarea
              rows={1}
              class="flex-grow min-h-[40px] max-h-[120px] resize-none block w-full rounded-md border-0 bg-neutral-700 px-3 py-2 text-neutral-100 placeholder:text-neutral-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6 custom-scrollbar-mobile"
              placeholder={t("chat.messagePlaceholder", $translations)}
              spellcheck={false}
              maxlength={MAX_CHAT_INPUT_LENGTH}
              bind:this={inputTextArea}
              bind:value={$inputText}
              on:keydown={onInputKeyDownLocal}
              use:builder.action
              {...builder} />
          </Combobox.Input>
          <div class="flex-shrink-0">
            <Button type="submit" size="icon" class="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white" aria-label={t("chat.sendMessage", $translations)}>
              <Fa icon={faPaperPlane} />
            </Button>
          </div>
        </div>
        {#if ($isEmojiSuggestionsOpenLocal || $isUsersPickerOpenLocal) && $isSuggestionsPopupOpen}
          <Combobox.Content
            class="z-50 max-h-44 overflow-y-auto flex rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none"
            transition={flyAndScale}
            sideOffset={5}>
            <div class="flex pl-3" bind:this={suggestionItemsDivLocal}>
              {#if $isEmojiSuggestionsOpenLocal}
                {#each $suggestedEmojisLocal2 as suggestion (suggestion.id)}
                  {#if suggestion.emoji}
                    <Combobox.Item class="select-none p-2 text-sm transition-all duration-75 data-[highlighted]:bg-muted" value={suggestion.id}>
                      <em-emoji shortcodes={suggestion.emoji.shortcodes} title={suggestion.emoji.shortcodes} fallback={suggestion.emoji.native} />
                    </Combobox.Item>
                  {/if}
                {/each}
              {/if}
            </div>
          </Combobox.Content>
        {/if}
        <Combobox.HiddenInput name={`mobile_private_chat_input_${currentConversation?.id || "none"}`} />
      </Combobox.Root>
    </form>
  </div>
{/if}

<style>
  .custom-scrollbar-mobile::-webkit-scrollbar {
    width: 5px;
  }
  .custom-scrollbar-mobile::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar-mobile::-webkit-scrollbar-thumb {
    background: theme("colors.neutral.600");
    border-radius: 3px;
  }
  .custom-scrollbar-mobile::-webkit-scrollbar-thumb:hover {
    background: theme("colors.neutral.500");
  }
  textarea.custom-scrollbar-mobile {
    scrollbar-width: thin;
    scrollbar-color: theme("colors.neutral.600") transparent;
  }
</style>
