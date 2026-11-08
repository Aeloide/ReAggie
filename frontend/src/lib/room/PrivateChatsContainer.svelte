<script lang="ts">
  import { privateConversations, type PrivateConversation } from "./stores"; // Adjust path
  import PrivateChatWindow from "./PrivateChatWindow.svelte";
  import { flip } from "svelte/animate";
  import { get } from "svelte/store";

  let draggedItemId: string | null = null;

  function handleDragStart(event: DragEvent, conversationId: string) {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", conversationId);
    }
    draggedItemId = conversationId;
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault(); // Necessary to allow drop
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleDrop(event: DragEvent, targetConversationId: string) {
    event.preventDefault();
    if (!draggedItemId || draggedItemId === targetConversationId) {
      draggedItemId = null;
      return;
    }

    const currentConversations = get(privateConversations);
    const draggedIndex = currentConversations.findIndex((c) => c.id === draggedItemId);
    const targetIndex = currentConversations.findIndex((c) => c.id === targetConversationId);

    if (draggedIndex === -1 || targetIndex === -1) {
      draggedItemId = null;
      return;
    }

    const newConversations = [...currentConversations];
    const [draggedItem] = newConversations.splice(draggedIndex, 1);
    newConversations.splice(targetIndex, 0, draggedItem);

    privateConversations.set(newConversations); // Update store with new order
    draggedItemId = null;
  }
</script>

{#if $privateConversations.length > 0}
  <div class="private-chats-container bottom-0 right-0 flex items-end gap-2 z-[100] pointer-events-none">
    {#each $privateConversations as conv (conv.id)}
      <div class="pointer-events-auto" animate:flip={{ duration: 250 }}>
        <PrivateChatWindow conversation={conv} onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop} />
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Ensure container doesn't block interactions with elements behind it when empty */
  .private-chats-container:empty {
    display: none;
  }
  .private-chats-container {
    /* required else the emoji suggestion box is behind */
    z-index: auto;
  }
</style>
