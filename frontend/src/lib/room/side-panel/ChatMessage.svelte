<script lang="ts">
  import type { ChatMessage } from "../types";
  import { shortTimeFormat } from "$room/ui-elements"; // Ensure this path is correct for your project
  import { parseMessage } from "./chatMessageParser"; // Ensure this path is correct
  import type { User } from "$room/game"; // Ensure this path is correct
  import { cn } from "$lib/utils"; // Ensure this path is correct

  export let msg: ChatMessage;
  export let me: User | undefined;

  $: isHighlighted = !hovered && me && msg.message.toLowerCase().includes("@" + me.name.toLowerCase());

  let hovered = false;

  function getMessageDate() {
    const timeStamp = msg.timeStamp;
    return timeStamp ? new Date(timeStamp) : new Date();
  }

  function collapseMultilineWhitespace(message: string) {
    return message.trim().replace(/\n{3,}/g, "\n\n");
  }
</script>

<div
  on:pointerenter={() => (hovered = true)}
  on:pointerleave={() => (hovered = false)}
  class={cn("p-2 pointer-events-auto bg-background rounded", {
    "animated-background bg-gradient-to-r from-background via-blue-900 to-background": isHighlighted,
  })}>
  <div class="w-full grid grid-cols-[1fr_auto] gap-1 items-center">
    <div class="font-bold truncate" title={msg.name} style:color={msg.color}>
      {msg.name}
    </div>
    <div class="text-xs opacity-50 cursor-default" title={getMessageDate().toLocaleString()}>
      {shortTimeFormat(getMessageDate())}
    </div>
  </div>
  <div class="break-words whitespace-pre-wrap text-ellipsis">
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
</div>

<style scoped>
  .meme {
    color: #b5bd68;
  }

  .animated-background {
    background-size: 400%;
    animation: animation 8s ease infinite;
  }

  @keyframes animation {
    0%,
    100% {
      background-position: 0% 50%;
    }

    50% {
      background-position: 100% 50%;
    }
  }

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
