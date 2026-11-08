<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import type { User } from "$room/game";
  import { Label } from "$lib/components/ui/label";
  import Switch from "$lib/components/ui/switch/switch.svelte";

  export let user: User;
  export let events: number;

  const baseId = `follow-${user.id}`;

  const notificationOptions = [
    { eventFlag: 1, labelText: t("account.createsPublic", $translations), switchId: `${baseId}-public-create` },
    { eventFlag: 2, labelText: t("account.createsPrivate", $translations), switchId: `${baseId}-private-create` },
    { eventFlag: 4, labelText: t("account.joinsPublic", $translations), switchId: `${baseId}-public-join` },
    { eventFlag: 8, labelText: t("account.joinsPrivate", $translations), switchId: `${baseId}-private-join` },
  ];

  const handleEventChange = (eventFlag: number, checked: boolean) => {
    if (checked) {
      events |= eventFlag;
    } else {
      events &= ~eventFlag;
    }
  };
</script>

<div class="px-6 py-4 space-y-2">
  <p class="text-sm text-muted-foreground mb-4">
    {t("modals.followRequestIntro", $translations).split("{name}")[0]}<span style={`color:${user.color}`}>{user.name}</span>{t("modals.followRequestIntro", $translations).split("{name}")[1] ?? ""}
  </p>

  {#each notificationOptions as option (option.eventFlag)}
    <div
      class="flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-border hover:bg-muted/60 transition-colors duration-150">
      <Label for={option.switchId} class="text-sm text-foreground cursor-pointer pr-2">
        {option.labelText}
      </Label>
      <Switch
        id={option.switchId}
        checked={(events & option.eventFlag) !== 0}
        onCheckedChange={(checked) => handleEventChange(option.eventFlag, checked)}
        aria-label={option.labelText} />
    </div>
  {/each}
</div>
