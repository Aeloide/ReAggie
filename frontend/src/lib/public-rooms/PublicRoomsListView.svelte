<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { goto } from "$app/navigation";
  import * as Table from "$lib/components/ui/table";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import Fa from "svelte-fa";
  import { faImages } from "@fortawesome/free-solid-svg-icons/faImages";
  import { faPercent } from "@fortawesome/free-solid-svg-icons/faPercent";
  import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
  import { faUser } from "@fortawesome/free-solid-svg-icons/faUser";
  import { faUsers } from "@fortawesome/free-solid-svg-icons/faUsers";
  import Th from "./Th.svelte";
  import { cn } from "$lib/utils";
  import { DataHandler } from "@vincjo/datatables";
  import { type PublicRoomInfo } from "./api";
  import ThumbnailPreview from "./ThumbnailPreview.svelte";
  import RoomBadges from "./RoomBadges.svelte";

  export let loading;
  export let handler: DataHandler<PublicRoomInfo>;

  const rows = handler.getRows();
  const iconProps = {
    size: "sm",
    class: "mr-1.5 text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300",
  } as const;
</script>

<Table.Root class="w-full">
  <Table.Header class="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
    <Table.Row>
      <Th {handler} orderBy="name" class="text-left text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">{t("rooms.name", $translations)}</Th>
      <Th
        {handler}
        orderBy="players"
        title={t("rooms.players", $translations)}
        centered
        class="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300 group">
        <div class="flex items-center justify-center">
          <Fa icon={faUsers} {...iconProps} /> {t("rooms.players", $translations)}
        </div>
      </Th>
      <Th
        {handler}
        orderBy="pieces"
        title={t("rooms.pieces", $translations)}
        centered
        class="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300 group">
        <div class="flex items-center justify-center">
          <Fa icon={faPuzzlePiece} {...iconProps} /> {t("rooms.pieces", $translations)}
        </div>
      </Th>
      <Th
        {handler}
        orderBy="sets"
        title={t("rooms.sets", $translations)}
        centered
        class="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300 group">
        <div class="flex items-center justify-center">
          <Fa icon={faImages} {...iconProps} /> {t("rooms.sets", $translations)}
        </div>
      </Th>
      <Th
        {handler}
        orderBy="completion"
        title={t("rooms.completion", $translations)}
        centered
        class="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300 group">
        <div class="flex items-center justify-center">
          <Fa icon={faPercent} {...iconProps} /> {t("rooms.completion", $translations)}
        </div>
      </Th>
      <Table.Head class="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">{t("rooms.extra", $translations)}</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body class="bg-white dark:bg-neutral-900 divide-y divide-neutral-100 dark:divide-neutral-800">
    {#if loading}
      {#each Array(5) as _}
        <Table.Row class="hover:bg-transparent dark:hover:bg-transparent">
          <Table.Cell class="">
            <div class="flex items-center gap-x-3">
              <Skeleton class="h-10 w-10 rounded-md" />
              <div class="flex-grow space-y-1.5">
                <Skeleton class="h-4 w-3/4" />
                <Skeleton class="h-3 w-1/2" />
              </div>
            </div>
          </Table.Cell>
          <Table.Cell class=""><Skeleton class="h-4 w-8 mx-auto" /></Table.Cell>
          <Table.Cell class=""><Skeleton class="h-4 w-8 mx-auto" /></Table.Cell>
          <Table.Cell class=""><Skeleton class="h-4 w-8 mx-auto" /></Table.Cell>
          <Table.Cell class="">
            <Skeleton class="h-4 w-16 mx-auto" />
          </Table.Cell>
          <Table.Cell class=""><Skeleton class="h-6 w-20 mx-auto" /></Table.Cell>
        </Table.Row>
      {/each}
    {:else if $rows.length === 0}
      <Table.Row>
        <Table.Cell colspan={6} class="text-center text-neutral-500 dark:text-neutral-400">{t("rooms.noPublic", $translations)}</Table.Cell>
      </Table.Row>
    {:else}
      {#each $rows as room, i (room.id)}
        <a href={`/${room.id}`} class="contents" title={t("rooms.viewRoom", $translations).replace("{name}", room.name)}>
          <Table.Row
            class={cn(
              "cursor-pointer transition-colors duration-150",
              i % 2 === 0 ? "bg-white dark:bg-neutral-900" : "bg-neutral-50/70 dark:bg-neutral-800/40",
              "hover:bg-neutral-100 dark:hover:bg-neutral-800",
            )}>
            <Table.Cell class="align-middle">
              <div class="flex items-center gap-x-3">
                <div class="flex-shrink-0">
                  <ThumbnailPreview {room} class="w-10 h-10 object-cover rounded-md border border-neutral-200 dark:border-neutral-700" />
                </div>
                <div>
                  <span
                    class:gay={room.gay}
                    class={cn(
                      "font-semibold text-sm text-neutral-800 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400",
                    )}>
                    {room.name}
                  </span>
                  {#if room.hostName}
                    <div title={t("rooms.hostedBy", $translations).replace("{name}", room.hostName)} class="mt-0.5 flex items-center text-xs text-neutral-500 dark:text-neutral-400">
                      <Fa icon={faUser} size="xs" class="mr-1 text-sky-500 dark:text-sky-400" />
                      <span>{room.hostName}</span>
                    </div>
                  {/if}
                </div>
              </div>
            </Table.Cell>

            <Table.Cell class="text-center align-middle text-sm text-neutral-700 dark:text-neutral-300">{room.players}</Table.Cell>
            <Table.Cell class="text-center align-middle text-sm text-neutral-700 dark:text-neutral-300">{room.pieces}</Table.Cell>
            <Table.Cell class="text-center align-middle text-sm text-neutral-700 dark:text-neutral-300">{room.sets}</Table.Cell>
            <Table.Cell class="align-middle text-sm text-neutral-700 dark:text-neutral-300">
              <div class="flex items-center justify-center">
                <span class="text-xs w-8 text-right">{(room.completion * 100)?.toFixed()}%</span>
              </div>
            </Table.Cell>
            <Table.Cell class="align-middle">
              <RoomBadges {room} />
            </Table.Cell>
          </Table.Row>
        </a>
      {/each}
    {/if}
  </Table.Body>
</Table.Root>

<style scoped>
  @keyframes rainbow {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 25%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  .gay {
    font-family: "Comic Sans MS", "Comic Sans", "Comic", cursive; /* Removed for a cleaner look, add back if it's a specific thematic choice */
    background-image: repeating-linear-gradient(45deg, violet, indigo, blue, green, yellow, orange, red, violet);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: rainbow 8s ease infinite;
    background-size: 800% 800%;
    display: inline-block; /* Ensures background doesn't spill if it's the only thing in a block */
  }
</style>
