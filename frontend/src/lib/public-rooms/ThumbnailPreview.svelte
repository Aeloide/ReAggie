<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { getAssetUrl } from "$lib";
  import * as Popover from "$lib/components/ui/popover";
  import { faEyeSlash } from "@fortawesome/free-solid-svg-icons/faEyeSlash";
  import Fa from "svelte-fa";
  import type { PublicRoomInfo } from "./api"; // Assuming this path is correct
  import { cn } from "$lib/utils";

  export let room: PublicRoomInfo;

  /**
   * Allows passing additional CSS classes to the thumbnail container.
   */
  let className = "";
  export { className as class }; // This allows using the prop as 'class'

  let open = false;

  // Default classes for the thumbnail trigger
  const defaultTriggerClasses = "size-6 hidden sm:block relative";
</script>

{#if room.thumbnail}
  <Popover.Root bind:open>
    <Popover.Trigger asChild let:builder>
      <div
        use:builder.action
        {...builder}
        on:pointerenter={() => (open = true)}
        on:pointerleave={() => (open = false)}
        class={cn(defaultTriggerClasses, className)} >
        <img
          src={getAssetUrl(room.thumbnail)}
          width="24"
          height="24"
          loading="lazy"
          alt={t("rooms.thumbnail", $translations)}
          class="size-full object-contain" />
        {#if room.hidePreview}
          <div class="absolute inset-0 backdrop-blur-[1px]" />
        {/if}
      </div>
    </Popover.Trigger>
    <Popover.Content class="p-0 pointer-events-none size-auto border-none shadow-xl dark:border-neutral-700">
      <div class="relative">
        <img
          src={getAssetUrl(room.thumbnail)}
          alt={t("rooms.thumbnailPreview", $translations)}
          class="max-w-xs max-h-xs object-contain rounded-md" />
        {#if room.hidePreview}
          <div class="absolute inset-0 flex flex-col items-center justify-center text-foreground/80 gap-2 p-2 backdrop-blur-lg rounded-md">
            <Fa icon={faEyeSlash} size="lg" />
            <p class="font-semibold text-center">{t("rooms.previewDisabled", $translations)}</p>
          </div>
        {/if}
      </div>
    </Popover.Content>
  </Popover.Root>
{/if}