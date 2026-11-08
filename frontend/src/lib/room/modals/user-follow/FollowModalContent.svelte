<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import type { User } from "$backend/types"; // Assuming this path is correct relative to this file
  import Switch from "$lib/components/ui/switch/switch.svelte";
  import { Label } from "$lib/components/ui/label";

  export let user: User;
  export let events: number; // This is a bitmask

  // Generate a unique base ID for ARIA attributes, useful if multiple instances of this modal could exist.
  // Using user.id makes it more stable if available.
  const baseId = `follow-options-${user?.id || Math.random().toString(36).slice(2)}`;

  // Define the notification options in an array for easier management and rendering
  const notificationOptions = [
    { eventFlag: 1, labelText: t("account.createsPublic", $translations), switchId: `${baseId}-public-create` },
    { eventFlag: 2, labelText: t("account.createsPrivate", $translations), switchId: `${baseId}-private-create` },
    { eventFlag: 4, labelText: t("account.joinsPublic", $translations), switchId: `${baseId}-public-join` },
    { eventFlag: 8, labelText: t("account.joinsPrivate", $translations), switchId: `${baseId}-private-join` },
    // You can add more options here if needed
  ];

  // Function to update the events bitmask when a switch changes
  const handleCheckedChange = (eventFlag: number, checked: boolean) => {
    if (checked) {
      events |= eventFlag; // Set the bit
    } else {
      events &= ~eventFlag; // Clear the bit
    }
  };
</script>

<div class="p-4 pt-0 md:p-6 md:pt-0 flex flex-col space-y-4">
  <p class="text-sm text-muted-foreground">
    {t("modals.followChoose", $translations).split("{name}")[0]}<span class="font-semibold" style={`color:${user.color}`}>{user.name}</span>{t("modals.followChoose", $translations).split("{name}")[1] ?? ""}
    <span class="block text-xs mt-1">{t("modals.followDeselect", $translations)}</span>
  </p>

  <div class="">
    {#each notificationOptions as option (option.eventFlag)}
      <div
        class="flex items-center justify-between p-1 -mx-3 sm:mx-0 sm:p-3 rounded-lg border border-transparent hover:border-border hover:bg-muted/60 transition-colors duration-150"
      >
        <Label for={option.switchId} class="text-sm text-foreground cursor-pointer pr-2">
          {option.labelText}
        </Label>
        <Switch
          id={option.switchId}
          checked={(events & option.eventFlag) !== 0}
          onCheckedChange={(e) => handleCheckedChange(option.eventFlag, e)}
          aria-label={option.labelText}
        />
      </div>
    {/each}
  </div>
</div>