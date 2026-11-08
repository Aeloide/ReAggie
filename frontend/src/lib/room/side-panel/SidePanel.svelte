<script lang="ts">
  import { setContext } from "svelte";
  import { settings } from "../stores";
  import ChatInput from "./ChatInput.svelte";
  import ChatLog from "./ChatLog.svelte";
  import UsersList from "./UsersList.svelte";
  import Chip from "./Chip.svelte";
  import { WhisperManager } from "$room/WhisperManager";
  import { chatInput } from "./chatInputStore";
  import UserIcon from "$lib/components/UserIcon.svelte";

  export let width = "w-[245px] max-w-[40vw]";
  export let display = "grid";

  let gridRows = "grid-rows-[auto_1fr_auto]";

  $: updateLayout(!!$settings.hideusers, !!$settings.hidechat);

  function updateLayout(hideusers: boolean, hidechat: boolean) {
    if (hideusers && hidechat) {
      gridRows = "items-end";
      return;
    }

    if (hideusers || hidechat) {
      gridRows = "grid-rows-[1fr_auto]";
      return;
    }

    gridRows = "grid-rows-[auto_1fr_auto]";
  }

  const whisperManager = new WhisperManager();
  const whisperedUsers = whisperManager.whisperedUsers;
  setContext("whisperlist", whisperManager);
</script>

<div class="h-full {width} {display} {gridRows} gap-1.5" style="
grid-row: span 2;
grid-column: 2;
">
  {#if !$settings.hideusers}
    <UsersList />
  {/if}
  {#if !$settings.hidechat}
    <ChatLog />
  {/if}
  <div class="pointer-events-auto flex flex-wrap gap-1 pb-2">
    {#if $whisperedUsers.length > 0 && $chatInput.visible}
      {#each $whisperedUsers as t (t.id)}
        <Chip onClose={() => whisperManager.removeWhisper(t)}>
          <div class="whitespace-nowrap flex gap-1 items-center">
            <UserIcon size="sm" user={t} />
            {t.name}
          </div>
        </Chip>
      {/each}
    {/if}
    <ChatInput />
  </div>
</div>
