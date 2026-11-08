<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { privateConversations, activeMobilePrivateChatUserId, users } from "./stores"; // Adjust path
  import Fa from "svelte-fa";
  import { faUserCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
  import { get } from "svelte/store";
  import { swipeToDelete } from "./swipeToDeleteAction"; // Adjust path
  import { slide } from "svelte/transition"; // Using slide for add/remove

  function openPrivateChat(userId: number, event?: MouseEvent) {
    // Check if the click was already handled (prevented) by the swipe action
    if (event && event.defaultPrevented) {
      return;
    }

    const currentActive = get(activeMobilePrivateChatUserId);
    if (currentActive === userId) {
      activeMobilePrivateChatUserId.set(null); // Toggle off if already active
    } else {
      activeMobilePrivateChatUserId.set(userId);
    }
  }

  function handleDeleteConversation(userId: number) {
    privateConversations.closeConversation(userId);
    if (get(activeMobilePrivateChatUserId) === userId) {
      activeMobilePrivateChatUserId.set(null); // Close panel if active chat is deleted
    }
  }
</script>

{#if $privateConversations.length > 0}
  {#each $privateConversations as conv (conv.withUser.id)}
    {@const user = conv.withUser}
    {@const isActive = $activeMobilePrivateChatUserId === user.id}
    {@const currentConversationId = conv.withUser.id}

    <div class="swipe-action-wrapper relative w-auto self-end rounded-full" transition:slide|local={{ duration: 250, axis: "y" }}>
      <div
        class="delete-reveal absolute inset-0 flex items-center justify-start bg-red-600 text-white rounded-full pointer-events-none overflow-hidden">
        <div class="px-4 transform translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-200">
          <Fa icon={faTrashAlt} />
        </div>
      </div>

      <button
        use:swipeToDelete={{
          threshold: 70, // Swipe 70px to delete
          onDelete: () => handleDeleteConversation(currentConversationId),
          getIsActive: () => isActive, // Pass function to check if button is active
          enableMouse: true,
        }}
        class="actual-button relative z-10 w-full pointer-events-auto flex items-center gap-2 rounded-full text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-800 focus:ring-blue-400
                 {isActive ? 'bg-blue-600 text-white py-2.5 px-4' : 'bg-neutral-700 text-neutral-200 py-2 px-3 hover:bg-neutral-600'}"
        style={`border: 2px solid ${user.color}; touch-action: pan-y;`}
        on:click={(e) => openPrivateChat(currentConversationId, e)}
        title={(isActive ? t("chat.closeUser", $translations) : t("chat.chatWith", $translations)).replace("{name}", user.name)}>
        <span class="truncate max-w-24 pointer-events-none">{user.name}</span>
        {#if conv.unread >= 1 && !isActive}
          <span
            class="ml-auto flex-shrink-0 bg-red-500 text-white text-xs font-semibold w-5 h-5 rounded-full flex items-center justify-center leading-none"
            aria-label={t("chat.unreadMessages", $translations).replace("{count}", String(conv.unread))}>
            {conv.unread > 9 ? "9+" : conv.unread}
          </span>
        {/if}
      </button>
    </div>
  {/each}
{/if}

<style>
  .swipe-action-wrapper {
    /* Ensures the button on top can cover the delete-reveal fully */
    background-color: transparent; /* Or match button's resting background if needed for edge cases */
  }

  .actual-button {
    /* background: #00000000; */
    /* This button will be translated horizontally by the action */
    /* Ensure it has a solid background to cover delete-reveal */
  }

  .delete-reveal {
    /* This is the red background. The icon inside is optional or can be styled differently. */
    /* The action doesn't directly control this element's visibility, */
    /* it's revealed as the `actual-button` is moved. */
    background: #00000000;
  }
</style>
