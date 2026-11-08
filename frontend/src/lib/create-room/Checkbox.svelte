<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import * as Popover from "$lib/components/ui/popover";
  import { cn } from "$lib/utils";
  import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons/faQuestionCircle";
  import Fa from "svelte-fa";

  export let id: string;
  export let checked: boolean;
  export let label: string;

  export let title: string | undefined = undefined;
  export let description: string | undefined = undefined;
</script>

<div class={cn("items-center flex space-x-2", description && "items-start")}>
  <Checkbox on:click {id} bind:checked {title} {...$$restProps} />
  <Label for={id} {title} class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
    {label}
    {#if $$slots.help}
      <Popover.Root>
        <Popover.Trigger>
          <Fa icon={faQuestionCircle} translateY={0.15} class="pl-0.5" />
        </Popover.Trigger>
        <Popover.Content>
          <slot name="help" />
        </Popover.Content>
      </Popover.Root>
    {/if}
    {#if description}
      <p class="text-muted-foreground text-xs font-normal pt-0.5">{description}</p>
    {/if}
  </Label>
</div>
