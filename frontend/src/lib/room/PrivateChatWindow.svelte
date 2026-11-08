<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { slide } from "svelte/transition";
  import { privateConversations, type PrivateConversation, users } from "./stores"; // Core stores
  import PrivateChatMessageDisplay from "./PrivateChatMessageDisplay.svelte";
  import { createEventDispatcher, onMount, afterUpdate, tick } from "svelte";
  import { get, writable, derived } from "svelte/store";
  import { SearchIndex } from "emoji-mart";

  // UI Components from your ChatInput
  import Fa from "svelte-fa";
  import { faFaceSmile } from "@fortawesome/free-solid-svg-icons/faFaceSmile";
  import { init as initEmojiMart, Picker as EmojiPicker } from "emoji-mart";
  import Button from "$lib/components/ui/button/button.svelte"; // Adjust path if needed
  import * as Popover from "$lib/components/ui/popover"; // Adjust path
  import { cn, flyAndScale, isOnlyEmotes } from "$lib/utils"; // Adjust path
  import UserIcon from "$lib/components/UserIcon.svelte"; // Adjust path
  import { Combobox } from "bits-ui"; // Adjust path
  // import { getEmotes as getEmotesUtil } from "../../../utils"; // Adjust path to your getEmotes util
  import emojis from "../room/side-panel/emojis"; // Assuming this is your custom emoji definition file
  import { getEmotes as getEmotesUtil } from "../../utils";
  import { useGame } from "./hooks/useGame";
  import type { User } from "$backend/types";

  // Props
  export let conversation: PrivateConversation;
  export let onDragStart: (event: DragEvent, convId: string) => void;
  export let onDragOver: (event: DragEvent) => void;
  export let onDrop: (event: DragEvent, targetConvId: string) => void;

  const dispatch = createEventDispatcher();
  const gameInstance = useGame(); // From your ChatInput

  // --- Local state for this chat window's input ---
  const inputText = writable("");
  const isEmojiPickerUiOpen = writable(false);
  const isSuggestionsPopupOpen = writable(false); // For Combobox (typed suggestions)
  const buildEmojiList = (spec: [id: string, ...keywords: string[]][]) =>
    spec.map((s) => ({
      id: s[0],
      name: s[0],
      keywords: s[1],
      skins: [{ src: `/${s[0]}.webp` }],
    }));

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

  // Placeholder for suggestion items - you'll need to implement your suggestion parsing
  const isEmojiSuggestionsOpenLocal = derived(suggestedEmojisLocal2, ($sel) => {
    console.log($sel);
    return $sel.length > 0;
  });

  // User suggestions are less common in 1-on-1, but can be implemented if needed
  const suggestedUsersLocal = writable<Array<{ id: string; label: string; user: User }>>([]); // Empty for now
  const isUsersPickerOpenLocal = derived(suggestedUsersLocal, ($sul) => $sul.length > 0);
  // --- End Local State ---

  let messagesContainer: HTMLDivElement;
  let inputTextArea: HTMLTextAreaElement;
  let emojiHolderDiv: HTMLDivElement;
  let suggestionItemsDivLocal: HTMLDivElement; // For Combobox items div

  const MAX_CHAT_INPUT_LENGTH = 300;
  let autoScroll = true;

  function scrollToBottom(force = false) {
    if (messagesContainer && (autoScroll || force)) {
      messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: "smooth" });
    }
  }

  afterUpdate(() => {
    scrollToBottom();
  });

  const custom = [
    {
      id: "gifs",
      name: "GIFs", // webp ackshually, chud
      emojis: buildEmojiList(emojis),
    },
  ];

  onMount(() => {
    initEmojiMart({ custom }); // Initialize emoji mart with your custom emojis
    setTimeout(() => scrollToBottom(true), 50);
  });

  const handleScroll = () => {
    if (!messagesContainer) return;
    autoScroll = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 50;
  };

  function closeWindow() {
    privateConversations.closeConversation(conversation.withUser.id);
  }

  function minimizeWindow() {
    privateConversations.toggleMinimizeConversation(conversation.withUser.id);
  }

  function handleHeaderClick() {
    if (conversation.isMinimized) {
      privateConversations.toggleMinimizeConversation(conversation.withUser.id);
      autoScroll = true;
      setTimeout(() => scrollToBottom(true), 0);
    }
  }

  async function focusInput() {
    if (!inputTextArea) return;
    await tick();
    inputTextArea.focus();
    if (!inputTextArea.isSameNode(document.activeElement)) {
      setTimeout(() => inputTextArea.focus(), 30);
    }
  }

  // --- Input and Submission Logic ---
  function onSubmitLocal(ev: Event) {
    const text = get(inputText).trim();
    if (text && gameInstance.connection.isConnected) {
      // Use game.connection.whisper for private messages
      // Assumes this will be processed by the server and echoed back appropriately
      // to be picked up by chatLog.addMessage -> privateConversations
      const allCurrentUsers = get(users);
      const myPlayerId = gameInstance.connection?.playerId;
      const myUser = allCurrentUsers.find((u) => u.id === myPlayerId)!; // Assumes User type has 'id'
      gameInstance.connection.whisper(text, conversation.withUser.id);
      privateConversations.processPrivateMessage(
        { message: text, color: myUser.color, timeStamp: Date.now(), id: myPlayerId!, name: myUser.name },
        myUser.id,
        conversation.withUser.id,
      );
      inputText.set(""); // Clear input
      isSuggestionsPopupOpen.set(false); // Close suggestions
      autoScroll = true;
      setTimeout(() => scrollToBottom(true), 0);
      focusInput();
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    } else if (!gameInstance.connection.isConnected) {
      // Handle case where connection is lost, maybe show a small error in the chat window
      console.warn("Private message not sent: not connected.");
    }
  }

  // Simplified local suggestion application - replace with your full logic
  function applyLocalSuggestion(suggestionValue: string) {
    const currentText = get(inputText);
    let newText = currentText;

    // Find the token that triggered the suggestion (e.g., ":smi" or "@us")
    // This is a highly simplified example. Your actual logic from chatInputStore will be more robust.
    const lastColon = currentText.lastIndexOf(":");
    const lastAt = currentText.lastIndexOf("@"); // If implementing user suggestions
    const startTokenIndex = Math.max(lastColon, lastAt);

    if (startTokenIndex > -1 && !currentText.substring(startTokenIndex + 1).includes(" ")) {
      // Try to find the actual suggestion object to get the full text to insert
      let suggestionToInsert = suggestionValue; // Default to the value itself
      const emojiSuggestion = get(suggestedEmojisLocal2).find((s) => s.id === suggestionValue);
      if (emojiSuggestion) {
        suggestionToInsert = emojiSuggestion.emoji!.shortcodes; // Or native representation
      }
      // else if (userSuggestion) { ... }

      newText = currentText.substring(0, startTokenIndex) + suggestionToInsert + " ";
    } else {
      newText += suggestionValue + " "; // Fallback
    }

    inputText.set(newText);
    isSuggestionsPopupOpen.set(false);
    focusInput();
  }

  function getHighlightedSuggestionLocal() {
    if (!suggestionItemsDivLocal) return null;
    const div = suggestionItemsDivLocal.querySelector("[data-highlighted]");
    const value = div?.getAttribute("data-value"); // bits-ui Combobox.Item uses data-value
    if (!value) return null;

    if (get(isEmojiSuggestionsOpenLocal)) {
      return get(suggestedEmojisLocal2).find((s) => s.id === value);
    }
    // Add similar for user suggestions if implemented
    return null;
  }

  function onInputKeyDownLocal(event: KeyboardEvent) {
    event.stopPropagation(); // Might be needed depending on other global handlers

    if (event.key === "Escape") {
      if (get(isSuggestionsPopupOpen)) {
        isSuggestionsPopupOpen.set(false);
        event.preventDefault();
        return;
      }
      if (get(isEmojiPickerUiOpen)) {
        isEmojiPickerUiOpen.set(false);
        event.preventDefault();
        return;
      }
      // Optionally blur or do nothing else for escape in PM window
      return;
    }

    const highlightedSuggestion = getHighlightedSuggestionLocal();

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (highlightedSuggestion && get(isSuggestionsPopupOpen)) {
        applyLocalSuggestion(highlightedSuggestion.id); // Use the suggestion's value/id
      } else {
        onSubmitLocal(event);
      }
      return;
    }

    if (event.key === "Tab" && get(isSuggestionsPopupOpen)) {
      event.preventDefault();
      if (highlightedSuggestion) {
        applyLocalSuggestion(highlightedSuggestion.id);
      } else {
        // Apply first suggestion if available
        const firstEmojiSuggestion = get(suggestedEmojisLocal2)[0];
        // const firstUserSuggestion = get(suggestedUsersLocal)[0];
        if (firstEmojiSuggestion) {
          applyLocalSuggestion(firstEmojiSuggestion.id);
        }
        // else if (firstUserSuggestion) { ... }
      }
      return;
    }

    // This is to prevent Combobox default behavior of navigating away from input
    // when arrow keys are pressed and no suggestions are open.
    // The original ChatInput had a more complex preventDefault logic.
    const KBD = { ARROW_DOWN: "ArrowDown", ARROW_UP: "ArrowUp", END: "End", HOME: "Home", PAGE_DOWN: "PageDown", PAGE_UP: "PageUp" };
    const FIRST_LAST_KEYS = [KBD.ARROW_DOWN, KBD.ARROW_UP, KBD.END, KBD.HOME, KBD.PAGE_DOWN, KBD.PAGE_UP];
    if (FIRST_LAST_KEYS.includes(event.key) && !get(isSuggestionsPopupOpen) && !event.metaKey && !event.ctrlKey) {
      // Allow default textarea behavior if suggestions are not open
    } else if (get(isSuggestionsPopupOpen)) {
      // Let Combobox handle navigation if suggestions are open
    }
  }

  function onComboboxSelectedChange(selectedItemValue: string | undefined) {
    if (!selectedItemValue) return;
    applyLocalSuggestion(selectedItemValue);
    // Combobox might clear selection after change, ensure focus remains if needed
    setTimeout(focusInput, 0);
  }

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

  // Determine if Combobox content should be shown
  $: comboboxContentShouldBeOpen = (get(isEmojiSuggestionsOpenLocal) || get(isUsersPickerOpenLocal)) && get(isSuggestionsPopupOpen);
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="private-chat-window flex flex-col bg-neutral-900 text-white border border-neutral-800 rounded-t-lg shadow-xl w-72"
  style="height: {conversation.isMinimized ? 'auto' : '24rem'}; max-height: 70vh;"
  on:dragstart={(e) => onDragStart(e, conversation.id)}
  on:dragover={onDragOver}
  on:drop|preventDefault={(e) => onDrop(e, conversation.id)}>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="chat-header bg-neutral-900 p-2 flex justify-between items-center cursor-pointer rounded-t-lg"
    class:cursor-grab={!conversation.isMinimized}
    class:cursor-pointer={conversation.isMinimized}
    title={conversation.isMinimized ? `Expand chat with ${conversation.withUser.name}` : `Chat with ${conversation.withUser.name}. Drag to reorder.`}
    on:click={handleHeaderClick}
    draggable={!conversation.isMinimized} on:dragstart={(e) => {
      // Optionally, prevent dragging if minimized and header click is for expansion
      if (conversation.isMinimized && e.target === e.currentTarget) {
         // Or just rely on draggable attribute above
      }
      onDragStart(e, conversation.id);
    }}
    >
    <span class="font-semibold truncate" style="color: {conversation.withUser.color || 'white'}">
      {conversation.withUser.name} {conversation.unread > 0 ? `(${conversation.unread})` : ''}
    </span>
    <div class="controls flex gap-1">
      <button
        on:click|stopPropagation={minimizeWindow}
        class="hover:bg-neutral-500 p-1 rounded-full w-6 h-6 flex items-center justify-center text-xs"
        aria-label={conversation.isMinimized ? t("chat.expand", $translations) : t("chat.minimize", $translations)}
        title={conversation.isMinimized ? t("chat.expand", $translations) : t("chat.minimize", $translations)}>
        {conversation.isMinimized ? "▲" : "—"}
      </button>
      <button
        on:click|stopPropagation={closeWindow}
        class="hover:bg-red-600 p-1 rounded-full w-6 h-6 flex items-center justify-center text-xs"
        aria-label={t("chat.closeChat", $translations)}
        title={t("chat.closeChat", $translations)}>
        ✕
      </button>
    </div>
  </div>

  {#if !conversation.isMinimized}
    <div
      class="messages-area flex-grow overflow-y-auto p-2 space-y-1 bg-neutral-800 custom-scrollbar"
      bind:this={messagesContainer}
      on:scroll={handleScroll}
      transition:slide={{ duration: 150 }}>
      {#each conversation.messages as msg (("ts" in msg && msg.ts) || JSON.stringify(msg))}
        <PrivateChatMessageDisplay {msg} conversationWithUser={conversation.withUser} />
      {/each}
    </div>

    <form class="chat-input-form p-1 border-t border-neutral-700 bg-neutral-900 relative" on:submit|preventDefault={onSubmitLocal}>
      <Combobox.Root bind:open={$isSuggestionsPopupOpen} onSelectedChange={(val) => onComboboxSelectedChange(val?.value)} portal={null}>
        <div class="relative flex items-center">
          <Combobox.Input asChild let:builder>
            <textarea
              bind:value={$inputText}
              rows={1}
              class={cn(
                "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                "min-h-[40px] resize-none pr-10", // Adjusted padding for emoji button
              )}
              placeholder={t("chat.messageTo", $translations).replace("{name}", conversation.withUser.name)}
              spellcheck={false}
              maxlength={MAX_CHAT_INPUT_LENGTH}
              bind:this={inputTextArea}
              on:keydown={onInputKeyDownLocal}
              use:builder.action
              {...builder} />
          </Combobox.Input>

          <div class="absolute right-1 top-1/2 -translate-y-1/2">
            <Popover.Root bind:open={$isEmojiPickerUiOpen} portal="#room-content">
              <Popover.Trigger asChild let:builder>
                <Button
                  builders={[builder]}
                  size="icon"
                  variant={$isEmojiPickerUiOpen ? "default" : "ghost"}
                  class="w-8 h-8 rounded-full"
                  aria-label={t("chat.openEmoji", $translations)}>
                  <Fa icon={faFaceSmile} />
                </Button>
              </Popover.Trigger>
              <Popover.Content class="p-0 w-[310px]">
                <div bind:this={emojiHolderDiv} />
              </Popover.Content>
            </Popover.Root>
          </div>
        </div>

        {#if ($isEmojiSuggestionsOpenLocal || $isUsersPickerOpenLocal) && $isSuggestionsPopupOpen}
          <Combobox.Content
          class="z-50 max-h-44 overflow-y-auto rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none"
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
        <Combobox.HiddenInput name={`private_chat_input_${conversation.id}`} />
      </Combobox.Root>
    </form>
  {/if}
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: theme("colors.neutral.700");
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: theme("colors.neutral.500");
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: theme("colors.neutral.400");
  }
  textarea {
    scrollbar-width: thin;
    scrollbar-color: theme("colors.neutral.500") theme("colors.neutral.700");
  }
</style>
