<script lang="ts">
  import { useGame } from "../hooks/useGame";
  import ChatMessage from "./ChatMessage.svelte";
  import FollowRequest from "./FollowRequest.svelte";
  import { chatLog, processes, users, followReqs } from "../stores";
  import EmoteMessage from "./EmoteMessage.svelte";
  import ProcessContainer from "./ProcessContainer.svelte";

  let messagesContainer: HTMLDivElement;

  let scrollPos = 0;

  const game = useGame();

  $: me = $users.find((u) => u.isMe);

  function getScrollPosFromBottom() {
    return messagesContainer.scrollHeight - messagesContainer.clientHeight - messagesContainer.scrollTop;
  }

  $: if ($chatLog.length && $users.length && messagesContainer) {
    tryScrollToBottom();
  }

  function tryScrollToBottom() {
    if (scrollPos < 20 || !game.connection.receivedHeartBeat) {
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    if (!messagesContainer) {
      return;
    }

    setTimeout(() => {
      if (!messagesContainer) {
        return;
      }
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: "instant",
      });
    }, 0);
  }
</script>

<svelte:window on:resize={() => tryScrollToBottom()} />

<div class="flex flex-col grow overflow-y-auto">
  <div
    class="flex flex-col gap-y-1 overflow-y-auto pointer-events-auto"
    bind:this={messagesContainer}
    on:resize={() => tryScrollToBottom()}
    on:scroll={(_) => (scrollPos = getScrollPosFromBottom())}>
    {#each $chatLog as msg (msg)}
      {#if "emotes" in msg}
        <EmoteMessage onLoad={tryScrollToBottom} {msg} {me} />
      {:else}
        <ChatMessage {msg} {me} />
      {/if}
    {/each}
    {#each $processes as proc (proc.id)}
      <ProcessContainer {proc} {me} />
    {/each}
    {#each $followReqs as req (req.rid)}
      <FollowRequest {req} />
    {/each}
  </div>
</div>
