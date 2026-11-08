<script lang="ts">
  import * as Sheet from "$lib/components/ui/sheet";
  import { faComments } from "@fortawesome/free-solid-svg-icons/faComments";
  import Fa from "svelte-fa";
  import SidePanel from "../side-panel/SidePanel.svelte";
  import { chatLog } from "../stores";
  import { Button } from "$lib/components/ui/button";

  let readMessageCount = $chatLog.length;
  let unreadMessageCount = 0;

  $: unreadMessageCount = $chatLog.length - readMessageCount;
</script>

<Sheet.Root portal="#room-content" closeFocus={null} onOpenChange={() => (readMessageCount = $chatLog.length)}>
  <Sheet.Trigger asChild let:builder>
    <Button variant="ghost" builders={[builder]} class="rounded-full pointer-events-auto px-0">
      <div style="font-size:2em">
        <Fa icon={faComments} />
      </div>
    </Button>
    {#if unreadMessageCount > 0}
      <div
        class="absolute inline-flex items-center justify-center size-5 text-xs text-foreground bg-blue-500/80 border border-muted/30 rounded-full -top-1 -end-1 pointer-events-none">
        {unreadMessageCount}
      </div>
    {/if}
  </Sheet.Trigger>
  <Sheet.Content class="bg-muted p-2 w-10/12 border rounded-l-sm">
    <SidePanel width="w-full" />
  </Sheet.Content>
</Sheet.Root>
