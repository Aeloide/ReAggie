<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import * as Popover from "$lib/components/ui/popover";
  import Fa from "svelte-fa";
  import { faPoo } from "@fortawesome/free-solid-svg-icons/faPoo";

  let open = false;
</script>

<Popover.Root bind:open disableFocusTrap>
  <Popover.Trigger asChild let:builder>
    <span
      use:builder.action
      {...builder}
      on:pointerenter={() => (open = true)}
      on:pointerleave={() => (open = false)}
      class="absolute p-0.5 -top-1 end-1/2 translate-x-1/2 -translate-y-1/2">
      <Fa icon={faPoo} size="sm" class="text-amber-700" />
    </span>
  </Popover.Trigger>
  <Popover.Content class="pointer-events-none w-80 whitespace-normal text-start">
    <ul>
      <li>{t("settings.obsolete1", $translations)}</li>
      <li>{t("settings.obsolete2", $translations)}</li>
      <li>{t("settings.obsolete3", $translations)}</li>
    </ul>
  </Popover.Content>
</Popover.Root>
