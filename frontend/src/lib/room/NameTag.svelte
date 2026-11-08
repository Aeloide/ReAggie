<script lang="ts">
  import UserIcon from "$lib/components/UserIcon.svelte";
  import type { NameTagEvent, User } from "$room/types";
  import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
  import { faLockOpen } from "@fortawesome/free-solid-svg-icons/faLockOpen";
  import { faUserNinja } from "@fortawesome/free-solid-svg-icons/faUserNinja";
  import Fa from "svelte-fa";
  import { tweened } from "svelte/motion";

  export let user: User;
  export let hidden: boolean;
  export let translate: string;
  export let event: NameTagEvent | undefined = undefined;

  $: icon = getIcon(event);

  const opacity = tweened(0);
  $: changeOpacity(hidden, event);

  function changeOpacity(hidden: boolean, event?: NameTagEvent) {
    if (hidden) {
      if (event) {
        // events are instantly disappear, so delay to notice
        const delay = event === "rotate" ? 400 : 1_600;
        opacity.set(0, { delay, duration: 800 });
      } else {
        opacity.set(0, { duration: 800 });
      }
    } else {
      if (event) {
        opacity.set(1, { duration: 0 });
      } else {
        opacity.set(1, { duration: 50 });
      }
    }
  }

  function getIcon(event?: NameTagEvent) {
    switch (event) {
      case "steal":
        return faUserNinja;
      case "lock":
        return faLock;
      case "unlock":
        return faLockOpen;
      default:
        return null;
    }
  }
</script>

<div
  class="absolute bg-background/80 border p-1 max-w-[10rem] rounded-full text-xs font-bold -translate-x-1/2 -translate-y-1/2"
  class:opacity-0={hidden}
  style:translate
  style:color={user.color}
  style:opacity={$opacity}>
  <div class="flex items-center justify-between gap-1">
    {#if user.avatar}
      <UserIcon {user} />
    {:else}
      {#if icon}
        <Fa {icon} />
      {/if}
      {#if user.isHost.has("RoomCreator")}
        <UserIcon {user} />
      {/if}
      <span class="truncate">{user.name}</span>
    {/if}
  </div>
</div>
