<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { getContext, onMount, tick } from "svelte";
  import { chatLog } from "../stores";
  import { chatInput, suggestedEmojis, suggestedUsers } from "./chatInputStore";
  import Fa from "svelte-fa";
  import { faFaceSmile } from "@fortawesome/free-solid-svg-icons/faFaceSmile";
  import { init, Picker } from "emoji-mart";
  import { useGame } from "../hooks/useGame";
  import type { WhisperManager } from "$room/WhisperManager";
  import Button from "$lib/components/ui/button/button.svelte";
  import * as Popover from "$lib/components/ui/popover";
  import { cn, flyAndScale, isOnlyEmotes } from "$lib/utils";
  import UserIcon from "$lib/components/UserIcon.svelte";
  import { Combobox } from "bits-ui";
  import { getEmotes } from "../../../utils";
  import emojis from "./emojis";

  let input: HTMLTextAreaElement;
  let emojiHolder: HTMLDivElement;
  let suggestionItemsDiv: HTMLDivElement;
  let isEmojiPickerOpen = false;

  const MAX_CHAT_INPUT_LENGTH = 300;

  function getSuggestionByValue(value: string) {
    if (isEmojiSuggestionsOpen) {
      return $suggestedEmojis.find((suggestion) => suggestion.id === value);
    }

    if (isUsersPickerOpen) {
      return $suggestedUsers.find((suggestion) => suggestion.id === value);
    }
  }

  function getHighlightedSuggestion() {
    const div = suggestionItemsDiv?.querySelector("[data-highlighted]");
    const value = div?.getAttribute("data-label");
    if (!value) {
      return;
    }

    return getSuggestionByValue(value);
  }

  function onSelectedChange(value: any) {
    if (!value) {
      return;
    }

    const suggestion = getSuggestionByValue(value);
    if (suggestion) {
      chatInput.applySuggestion(suggestion);
    }
  }

  const kbd = {
    ARROW_DOWN: "ArrowDown",
    ARROW_UP: "ArrowUp",
    END: "End",
    HOME: "Home",
    PAGE_DOWN: "PageDown",
    PAGE_UP: "PageUp",
  };
  const FIRST_KEYS = [kbd.ARROW_DOWN, kbd.PAGE_UP, kbd.HOME];
  const LAST_KEYS = [kbd.ARROW_UP, kbd.PAGE_DOWN, kbd.END];
  const FIRST_LAST_KEYS = [...FIRST_KEYS, ...LAST_KEYS];

  function onInputKeyDown(event: KeyboardEvent) {
    event.stopPropagation();
    const olde = event.preventDefault.bind(event);
    event.preventDefault = () => {
      // TODO: hack
      const suggestion = getHighlightedSuggestion(); // only way to know if the suggestion listing is open?...
      if (FIRST_LAST_KEYS.includes(event.key) && !suggestion) return;
      olde();
    };
    if (event.key === "Escape") {
      if (isPopupOpen) {
        isPopupOpen = false;
        return;
      }

      close();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      const suggestion = getHighlightedSuggestion();
      if (suggestion) {
        event.preventDefault();
        chatInput.applySuggestion(suggestion);
        return;
      }

      onSubmit();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();

      const suggestion = getHighlightedSuggestion();
      if (suggestion) {
        chatInput.applySuggestion(suggestion);
        return;
      }

      const firstSuggestion = $suggestedEmojis?.[0] || $suggestedUsers?.[0];
      if (firstSuggestion) {
        chatInput.applySuggestion(firstSuggestion);
        return;
      }
    }
  }

  const game = useGame();

  function open() {
    chatInput.setVisible(true);
  }

  function close() {
    chatInput.setVisible(false);
    closeEmojiPopup();
    input.blur();
  }

  function closeEmojiPopup() {
    isEmojiPickerOpen = false;
  }

  function onWindowKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && game.connection.isConnected) {
      event.preventDefault();
      open();
    }
  }

  const whisperManager = getContext<WhisperManager>("whisperlist");
  const whisperedUsers = whisperManager.whisperedUsers;

  function onSubmit() {
    if ($chatInput.text === "/clear") {
      chatLog.clear();
    } else if ($chatInput.text === "/stress") {
      game.doEntityStress();
    } else if ($chatInput.text === "/cleanup") {
      game.connection.raw({ type: "cleanup_layout" });
    } else if ($chatInput.text && $chatInput.text.trim()) {
      if ($whisperedUsers.length > 0) {
        $whisperedUsers.forEach((w) => game.connection.whisper($chatInput.text, w.id));
      } else {
        if (isOnlyEmotes($chatInput.text)) {
          const emotes = getEmotes($chatInput.text);
          if (emotes.length <= 5) game.connection.emote($chatInput.text);
          else game.connection.chat($chatInput.text);
        } else game.connection.chat($chatInput.text);
      }
    }
    close();
  }

  async function focusInput() {
    await tick();
    input.focus();

    // just in case to fix unexpected behaviour (e.g. whispers)
    if (!input.isSameNode(document.activeElement)) {
      setTimeout(() => {
        input.focus();
      }, 30);
    }
  }

  $: if ($chatInput.visible && input) focusInput();

  $: isEmojiSuggestionsOpen = $suggestedEmojis?.length > 0;
  $: isUsersPickerOpen = $suggestedUsers.length > 0;

  let isPopupOpen = false;

  $: handlePopupChange(isEmojiSuggestionsOpen || isUsersPickerOpen);
  function handlePopupChange(open: boolean) {
    isPopupOpen = open;
  }

  $: if (isPopupOpen && !isEmojiSuggestionsOpen && !isUsersPickerOpen) {
    isPopupOpen = false;
  }

  $: isEmojiPickerOpen && emojiHolder && showEmojiPicker();

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

  async function showEmojiPicker() {
    const emojiPicker = new Picker({
      previewPosition: "none",
      autoFocus: true,
      custom,
      emojiButtonSize: 28,
      emojiSize: 20,
      perLine: 10,
      theme: "dark",
      onEmojiSelect: (emoji: any) => {
        chatInput.addEmoji(emoji);
        closeEmojiPopup();
      },
    });

    await tick();
    emojiHolder.replaceChildren(emojiPicker as any);
  }

  onMount(() => {
    init({ custom });

    return () => {
      chatInput.reset();
    };
  });

  let selected: any;
  $: selected, (selected = []);
</script>

<svelte:window on:keydown={onWindowKeyDown} />

<div class:md:invisible={!$chatInput.visible} id="chat-input" class="w-full bg-background rounded">
  <form class="pointer-events-auto relative h-full" on:submit={() => onSubmit()}>
    <Combobox.Root
      bind:open={isPopupOpen}
      multiple
      bind:selected
      onSelectedChange={(e) => {
        onSelectedChange(e?.[0].value);
      }}
      bind:inputValue={$chatInput.text}>
      <Combobox.Input asChild let:builder>
        <textarea
          rows={1}
          class={cn(
            "border-input placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border bg-transparent px-3 py-2 shadow-sm focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
            "min-h-full resize-none pr-8",
          )}
          placeholder={t("chat.enterMessage", $translations)}
          spellcheck={false}
          maxlength={MAX_CHAT_INPUT_LENGTH}
          bind:this={input}
          bind:value={$chatInput.text}
          on:keydown={onInputKeyDown}
          {...builder}
          use:builder.action />
      </Combobox.Input>

      <Combobox.Content
        sameWidth
        class="z-50 max-h-44 overflow-y-auto rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none"
        transition={flyAndScale}
        sideOffset={2}>
        {#if isEmojiSuggestionsOpen}
          <div class="flex pl-3" bind:this={suggestionItemsDiv}>
            {#each $suggestedEmojis as suggestion (suggestion.id)}
              {#if suggestion.emoji}
                <Combobox.Item class="select-none p-2 text-sm transition-all duration-75 data-[highlighted]:bg-muted" value={suggestion.id}>
                  <em-emoji shortcodes={suggestion.emoji.shortcodes} title={suggestion.emoji.shortcodes} fallback={suggestion.emoji.native} />
                </Combobox.Item>
              {/if}
            {/each}
          </div>
        {:else if isUsersPickerOpen}
          <div class="flex flex-col" bind:this={suggestionItemsDiv}>
            {#each $suggestedUsers as suggestion (suggestion.id)}
              {#if suggestion.user}
                <Combobox.Item
                  class="flex gap-1 w-full select-none items-center py-2 pl-3 text-sm transition-all duration-75 data-[highlighted]:bg-muted"
                  value={suggestion.id}>
                  <UserIcon user={suggestion.user} />
                  <span class="truncate">{suggestion.user.name}</span>
                </Combobox.Item>
              {/if}
            {/each}
          </div>
        {/if}
      </Combobox.Content>
      <Combobox.HiddenInput name="favoriteFruit" />
    </Combobox.Root>

    <Popover.Root bind:open={isEmojiPickerOpen} portal="#room-content">
      <Popover.Trigger asChild let:builder>
        <Button
          builders={[builder]}
          size="icon"
          class="absolute end-2 top-1/2 -translate-y-1/2 size-6 rounded-full"
          variant={isEmojiPickerOpen ? "default" : "ghost"}>
          <Fa icon={faFaceSmile} />
        </Button>
      </Popover.Trigger>
      <Popover.Content class="p-0 w-[310px]">
        <div bind:this={emojiHolder} />
      </Popover.Content>
    </Popover.Root>
  </form>
</div>
