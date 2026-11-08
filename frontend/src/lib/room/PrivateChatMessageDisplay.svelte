<script lang="ts">
  import type { ChatMessage, EmoteMessage } from "./types"; // Adjust path to stores.ts

  import { game } from "$room";
  import { get } from "svelte/store";
  import type { User } from "$backend/types";
  import { users } from "./stores";
  import { parseMessage } from "./side-panel/chatMessageParser";

  export let msg: ChatMessage | EmoteMessage;
  export let conversationWithUser: User; // The other person in this chat

  const myPlayerId = game.connection?.playerId;
  const sentByMe = msg.id === myPlayerId;

  let displayName: string;
  let displayColor: string;

  if (sentByMe) {
    displayName = "You";
    // Find your own color if needed, or use a default
    const meUser = get(users).find((u) => u.id === myPlayerId);
    displayColor = meUser?.color || "#999999";
  } else {
    displayName = conversationWithUser.name;
    displayColor = conversationWithUser.color;
  }

  function formatTime(timestamp?: number): string {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function collapseMultilineWhitespace(message: string) {
    return message.trim().replace(/\n{3,}/g, "\n\n");
  }
</script>

<div class="private-chat-message p-1 text-sm mb-1" class:text-right={sentByMe} class:text-left={!sentByMe}>
  {#if "emotes" in msg}
    <div>
      <span class="font-semibold" style="color: {displayColor}">{displayName}:</span>
    </div>
    {#each msg.emotes as emote}
      <img src={emote} alt={emote} title={emote} class="emote h-6 w-6 inline-block mx-0.5" />
    {/each}
  {:else}
    <div class="name-time">
      <span class="font-semibold" style="color: {displayColor}">{displayName}</span>
      {#if msg.timeStamp}<span class="timestamp text-xs text-gray-500 ml-1">{formatTime(msg.timeStamp)}</span>{/if}
    </div>
    <div
      class="message-text break-words whitespace-pre-wrap {sentByMe ? 'bg-blue-600' : 'bg-neutral-700'} inline-block p-2 rounded-lg mt-0.5"
      style="max-width: 85%;">
      {#each collapseMultilineWhitespace(msg.message).split("\n") as line}
        <div class:meme={line.trimStart()[0] == ">"}>
          {#each parseMessage(line) as part}
            {#if part.text}
              <span>{part.text}</span>
            {:else if part.emoji}
              <em-emoji shortcodes={part.emoji} title={part.emoji} fallback={part.emoji} />
            {:else if part.url}
              <a href={part.url} target="_blank" class="text-blue-500 hover:underline">{part.url}</a>
            {:else if part.spoilerContent !== undefined}
              <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
              <span class="spoiler" tabindex="0">{part.spoilerContent}</span>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .emote {
    vertical-align: middle;
  }
  /* Add any additional specific styling */

  .spoiler {
    background-color: black;
    color: black;
    border: 0.1px solid gray;
    padding: 0 0.2em; /* Optional: slight horizontal padding */
    border-radius: 3px; /* Optional: slightly rounded corners for aesthetics */
    cursor: pointer; /* Indicate it's interactive */
    transition: color 0.1s ease-in-out; /* Smooth transition for text color */
    user-select: none; /* Prevent text selection when in hidden state */
  }

  .spoiler:hover,
  .spoiler:focus, /* Reveals on click (when focused) */
  .spoiler:active {
    /* Reveals during the mouse button press */
    color: white;
    user-select: text; /* Allow text selection when revealed */
  }

  /* Optional: remove default browser focus outline if it's visually disruptive */
  .spoiler:focus {
    outline: none;
    /* Or a subtle custom outline: */
    /* outline: 1px dashed #444; */
  }
</style>
