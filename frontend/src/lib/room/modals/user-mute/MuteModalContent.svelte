<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import type { User } from "$backend/types"; // Assuming User type is needed, though not directly used in this template
  // Import UI components. Paths might need slight adjustment based on your exact file structure within /ui/
  // e.g. if TabsTrigger is tabs/trigger.svelte etc.
  // Assuming a structure like import { Root as TabsRoot, List as TabsList, ... } from "$lib/components/ui/tabs";
  // For brevity, I'll use a simpler import style here and assume they are exported from the main index of each folder.
  import * as Tabs from "$lib/components/ui/tabs";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { Label } from "$lib/components/ui/label";

  export let user: User; // Passed in, used by parent MuteModal for the dialog title
  export let mutetype: { type: "asn" } | { type: "ip"; range: "exact" | "narrow" | "large" };

  // Local reactive state for UI controls, initialized from the `mutetype` prop
  let currentMuteType: "ip" | "asn" = mutetype.type;
  let currentRange: "exact" | "narrow" | "large" = mutetype.type === "ip" && mutetype.range ? mutetype.range : "exact";

  const typeDescriptions: Record<"ip" | "asn", string> = {
    ip: t("modals.muteIpDescription", $translations),
    asn: t("modals.muteAsnDescription", $translations),
  };

  const rangeInfo: Record<"exact" | "narrow" | "large", { title: string; description: string }> = {
    exact: {
      title: t("modals.exactIp", $translations),
      description: t("modals.exactIpDescription", $translations),
    },
    narrow: {
      title: t("modals.narrowSubnet", $translations),
      description: t("modals.narrowSubnetDescription", $translations),
    },
    large: {
      title: t("modals.largeSubnet", $translations),
      description: t("modals.largeSubnetDescription", $translations),
    },
  };

  // This reactive block ensures the exported `mutetype` prop is updated whenever internal UI selections change.
  $: {
    if (currentMuteType === "ip") {
      mutetype = { type: "ip", range: currentRange };
    } else {
      // When type is ASN, there's no range. Ensure `mutetype` reflects this.
      mutetype = { type: "asn" };
    }
  }

  const blockRangeOptions = [
    { value: "exact", label: rangeInfo.exact.title },
    { value: "narrow", label: rangeInfo.narrow.title },
    { value: "large", label: rangeInfo.large.title },
  ] as const;
</script>

<div class="p-4 pt-0 md:p-6 md:pt-0 flex flex-col space-y-6">
  <div class="space-y-2">
    <Label class="text-base font-medium text-foreground">{t("modals.blockMethod", $translations)}</Label>
    <Tabs.Root
      value={currentMuteType}
      onValueChange={(detail) => {
        if (detail) currentMuteType = detail;
      }}
      class="w-full">
      <Tabs.List class="grid w-full grid-cols-2 border-b border-border">
        <Tabs.Trigger
          value="ip"
          class="data-[state=active]:text-primary focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2 ring-offset-background">
          {t("modals.ipAddress", $translations)}
        </Tabs.Trigger>
        <Tabs.Trigger
          value="asn"
          class="data-[state=active]:text-primary focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2 ring-offset-background">
          {t("modals.asnTab", $translations)}
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
    <p class="text-sm text-muted-foreground pt-1.5 min-h-[3rem]">{typeDescriptions[currentMuteType]}</p>
  </div>

  {#if currentMuteType === "ip"}
    <div class="space-y-2">
      <Label class="text-base font-medium text-foreground">{t("modals.ipGranularity", $translations)}</Label>
      <ToggleGroup.Root
        type="single"
        value={currentRange}
        onValueChange={(detail) => {
          if (detail) currentRange = detail;
        }}
        class="flex flex-col sm:flex-row sm:gap-2 gap-2"
        aria-label={t("modals.ipGranularity", $translations)}>
        {#each blockRangeOptions as option (option.value)}
          <ToggleGroup.Item
            value={option.value}
            aria-label={option.label}
            class="w-full sm:w-auto  justify-center px-4 py-2 border border-input rounded-md text-sm font-medium hover:bg-muted focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2 ring-offset-background data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary data-[state=on]:hover:bg-primary/90">
            {option.label}
          </ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <p class="text-sm text-muted-foreground pt-1.5 min-h-[4rem]">{rangeInfo[currentRange].description}</p>
    </div>
  {/if}
</div>
