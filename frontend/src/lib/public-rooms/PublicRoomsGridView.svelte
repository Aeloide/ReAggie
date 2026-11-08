<script lang="ts">
  import { isMobileQuery } from "$lib/utils";
  import { DataHandler } from "@vincjo/datatables";
  import { type PublicRoomInfo } from "./api";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import GridViewRoomItem from "./GridViewRoomItem.svelte";

  export let loading;
  export let handler: DataHandler<PublicRoomInfo>;

  const rows = handler.getRows();
  const isMobile = isMobileQuery();

  $: groupsCount = $isMobile ? 2 : 4;
  $: groups = convertToGroups($rows, groupsCount);

  function convertToGroups(rooms: PublicRoomInfo[], groupsCount: number) {
    const groups: PublicRoomInfo[][] = [];
    for (let i = 0; i < groupsCount; i++) {
      groups.push([]);
    }

    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      groups[i % groupsCount].push(room);
    }

    return groups;
  }
</script>

<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
  {#if loading}
    {#each [...Array(groupsCount)] as _, i (i)}
      <Skeleton class="w-full h-36" />
    {/each}
  {:else}
    {#each groups as group}
      <div class="flex flex-col gap-3">
        {#each group as room}
          <GridViewRoomItem {room} />
        {/each}
      </div>
    {/each}
  {/if}
</div>
