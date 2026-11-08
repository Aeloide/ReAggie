<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { Label } from "$lib/components/ui/label";
  import * as Tabs from "$lib/components/ui/tabs";

  export let texture: string;

  if (!texture) {
    texture = "none";
  }
</script>

<div>
  <Label>{t("colors.texture", $translations)}</Label>
  <Tabs.Root bind:value={texture}>
    <Tabs.List class="grid grid-cols-3 h-auto">
      <Tabs.Trigger value="none">{t("colors.none", $translations)}</Tabs.Trigger>
      <Tabs.Trigger value="wool">{t("colors.wool", $translations)}</Tabs.Trigger>
      <Tabs.Trigger value="sheer">{t("colors.sheer", $translations)}</Tabs.Trigger>
      <Tabs.Trigger value="leather">{t("colors.leather", $translations)}</Tabs.Trigger>
      <Tabs.Trigger value="leather2">{t("colors.leather2", $translations)}</Tabs.Trigger>
      <Tabs.Trigger value="jacquard">{t("colors.jacquard", $translations)}</Tabs.Trigger>
    </Tabs.List>
  </Tabs.Root>
</div>
