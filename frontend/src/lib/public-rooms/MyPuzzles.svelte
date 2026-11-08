<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import Fa from "svelte-fa";
  import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
  import { faTrash } from "@fortawesome/free-solid-svg-icons/faTrash";
  import { faPercent } from "@fortawesome/free-solid-svg-icons/faPercent";
  import { listOfflineRooms, deleteOfflineRoom, type OfflineRoom } from "$lib/offline/db";

  let rooms: OfflineRoom[] = [];
  let loading = true;
  let objectUrls: Map<string, string> = new Map();

  onMount(async () => {
    await loadRooms();
    return () => {
      // Clean up object URLs to prevent memory leaks
      for (const url of objectUrls.values()) {
        URL.revokeObjectURL(url);
      }
    };
  });

  async function loadRooms() {
    loading = true;
    try {
      rooms = await listOfflineRooms();
      // Generate object URLs for thumbnails
      const newUrls = new Map<string, string>();
      for (const r of rooms) {
        if (r.imageBlob) {
          newUrls.set(r.id, URL.createObjectURL(r.imageBlob));
        }
      }
      objectUrls = newUrls;
    } catch (e) {
      console.error("Failed to load offline rooms:", e);
    } finally {
      loading = false;
    }
  }

  async function handleDelete(id: string) {
    if (confirm(t("rooms.confirmDelete", $translations))) {
      try {
        await deleteOfflineRoom(id);
        const url = objectUrls.get(id);
        if (url) {
          URL.revokeObjectURL(url);
          objectUrls.delete(id);
        }
        await loadRooms();
      } catch (e) {
        console.error("Failed to delete offline room:", e);
      }
    }
  }

  const iconProps = {
    size: "sm",
    class: "mr-1.5 text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300",
  } as const;
</script>

<Table.Root class="w-full">
  <Table.Header class="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
    <Table.Row>
      <Table.Head class="text-left text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">{t("rooms.name", $translations)}</Table.Head>
      <Table.Head class="text-center text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
        <div class="flex items-center justify-center">
          <Fa icon={faPuzzlePiece} {...iconProps} /> {t("rooms.pieces", $translations)}
        </div>
      </Table.Head>
      <Table.Head class="text-center text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
        <div class="flex items-center justify-center">
          <Fa icon={faPercent} {...iconProps} /> {t("rooms.progress", $translations)}
        </div>
      </Table.Head>
      <Table.Head class="text-right text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">{t("rooms.actions", $translations)}</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body class="bg-white dark:bg-neutral-900 divide-y divide-neutral-100 dark:divide-neutral-800">
    {#if loading}
      {#each Array(3) as _}
        <Table.Row class="hover:bg-transparent dark:hover:bg-transparent">
          <Table.Cell>
            <div class="flex items-center gap-x-3">
              <Skeleton class="h-10 w-10 rounded-md" />
              <div class="flex-grow space-y-1.5">
                <Skeleton class="h-4 w-3/4" />
                <Skeleton class="h-3 w-1/2" />
              </div>
            </div>
          </Table.Cell>
          <Table.Cell><Skeleton class="h-4 w-8 mx-auto" /></Table.Cell>
          <Table.Cell><Skeleton class="h-4 w-16 mx-auto" /></Table.Cell>
          <Table.Cell><Skeleton class="h-8 w-24 ml-auto" /></Table.Cell>
        </Table.Row>
      {/each}
    {:else if rooms.length === 0}
      <Table.Row>
        <Table.Cell colspan={4} class="text-center py-8 text-neutral-500 dark:text-neutral-400">
          {t("rooms.noOffline", $translations)}
        </Table.Cell>
      </Table.Row>
    {:else}
      {#each rooms as room}
        <Table.Row class="group hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
          <Table.Cell class="font-medium text-neutral-900 dark:text-neutral-100">
            <div class="flex items-center gap-x-3">
              {#if objectUrls.has(room.id)}
                <img
                  src={objectUrls.get(room.id)}
                  alt={room.name}
                  class="h-10 w-10 object-cover rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800"
                />
              {:else}
                <div class="h-10 w-10 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center">
                  <Fa icon={faPuzzlePiece} class="text-neutral-400" />
                </div>
              {/if}
              <div class="flex flex-col text-left">
                <span class="font-semibold text-sm line-clamp-1">{room.name || t("createRoom.offlinePuzzle", $translations)}</span>
                <span class="text-[10px] text-neutral-500 dark:text-neutral-400">{t("rooms.created", $translations).replace("{date}", new Date(room.created_at).toLocaleDateString())}</span>
              </div>
            </div>
          </Table.Cell>
          <Table.Cell class="text-center text-sm font-semibold">{room.pieces}</Table.Cell>
          <Table.Cell class="text-center text-sm">
            {#if room.gameState?.completion !== undefined}
              {Math.round(room.gameState.completion * 100)}%
            {:else}
              0%
            {/if}
          </Table.Cell>
          <Table.Cell class="text-right">
            <div class="flex items-center justify-end gap-2">
              <Button size="sm" on:click={() => goto(`/offline/${room.id}`)}>{t("rooms.playSolo", $translations)}</Button>
              <Button size="icon" variant="ghost" class="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" on:click={() => handleDelete(room.id)}>
                <Fa icon={faTrash} />
              </Button>
            </div>
          </Table.Cell>
        </Table.Row>
      {/each}
    {/if}
  </Table.Body>
</Table.Root>
