<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { HostCapabilities, type User } from "$backend/types";
  import { otherSettings } from "../../stores";
  import Switch from "$lib/components/ui/switch/switch.svelte";
  import { Label } from "$lib/components/ui/label";
  import { onMount } from "svelte";
  import type { Permission } from "$lib/room/permissions";

  export let user: User;
  export let permissions: Permission[] = [];
  export let activePermissions: Permission[] = [];

  type VisibleOpts = Exclude<keyof typeof HostCapabilities, "Admin" | "RoomCreator" | "Ban" | "Debug" | "ReadBanlist">;
  let opts: Record<VisibleOpts, string> = {
    ChangeRoomSettings: t("modals.permChangeRoomSettings", $translations),
    Cleanup: t("modals.permCleanup", $translations),
    Delete: t("modals.permDelete", $translations),
    Kick: t("modals.permKick", $translations),
    KickImmune: t("modals.permKickImmune", $translations),
    Lock: t("modals.permLock", $translations),
    Playlist: t("modals.permPlaylist", $translations),
    Poll: t("modals.permPoll", $translations),
    Restart: t("modals.permRestart", $translations),
    SlowMode: t("modals.permSlowMode", $translations),
    Rollback: t("modals.permRollback", $translations),
    Delegate: t("modals.permDelegate", $translations),
    Notes: t("modals.permNotes", $translations),
  };

  const entries = Object.entries(opts) as [keyof typeof opts, string][];

  let checkedOpts = {} as Record<VisibleOpts, boolean>;
  let disabledOpts = {} as Record<VisibleOpts, boolean>;
  let initializedOpts = false;
  let previousUserId: number | null = null;

  // Initialize toggles once when component mounts
  onMount(() => {
    if (user && !initializedOpts) {
      initializeToggles(user);
      initializedOpts = true;
      previousUserId = user.id;
    }
  });

  // Watch for changes to the user prop
  $: if (user && previousUserId !== user.id) {
    initializeToggles(user);
    previousUserId = user.id;
  }

  $: permissions = calculatePermissions(checkedOpts);
  $: activePermissions = calculatePermissions(checkedOpts);

  function calculatePermissions(opts: Record<VisibleOpts, boolean>): Permission[] {
    return Object.entries(opts)
      .filter(([key, value]) => value)
      .map(([key]) => key) as Permission[];
  }
  function initializeToggles(currentUser: User) {
    for (const entry of entries) {
      const key = entry[0] as VisibleOpts;
      const checked = currentUser.isHost.has(key);

      // Only set initial values, don't overwrite user changes
      if (checkedOpts[key] === undefined) {
        checkedOpts[key] = checked;
      }

      disabledOpts[key] = checked;
    }
    // Force Svelte to recognize these objects have changed
    checkedOpts = { ...checkedOpts };
    disabledOpts = { ...disabledOpts };
  }
</script>

<div class="max-h-64 overflow-y-auto p-4 bg-surface-50-900-token border border-surface-200-700-token">
  <div class="flex flex-col gap-2">
    <div class="flex items-center space-x-2 mr-6">
      <Switch
        id="perm-all"
        onCheckedChange={(bool) => {
          entries.forEach(([key]) => {
            if ($otherSettings.host[key] && !disabledOpts[key]) checkedOpts[key] = bool;
          });
        }} />
      <Label for="perm-all">{t("modals.toggleAll", $translations)}</Label>
    </div>
    {#each entries as [key, label]}
      {#if $otherSettings.host[key]}
        <div class="flex items-center space-x-2 mr-6">
          <Switch id={`perm-${key}`} bind:checked={checkedOpts[key]} disabled={disabledOpts[key]} />
          <Label for={`perm-${key}`}>{label}</Label>
        </div>
      {/if}
    {/each}
  </div>
</div>
