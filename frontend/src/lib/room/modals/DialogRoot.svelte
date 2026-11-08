<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { page } from "$app/stores";
  import type { HTMLAttributes } from "svelte/elements";
  import { modalBodyEvents } from "$lib/directives";
  import { cn } from "$lib/utils";

  export let stateKey: keyof App.PageState;

  let className: HTMLAttributes<HTMLDivElement>["class"] = undefined;
  export { className as class };

  $: open = !!$page.state[stateKey];

  let el: HTMLDivElement;
  $: el && modalBodyEvents(el);
</script>

<Dialog.Root {open} onOpenChange={(open) => !open && history.back()}>
  <Dialog.Content bind:el class={cn("max-h-full overflow-y-auto w-full sm:max-w-2xl p-3 sm:p-6", className)}>
    <slot />
  </Dialog.Content>
</Dialog.Root>
