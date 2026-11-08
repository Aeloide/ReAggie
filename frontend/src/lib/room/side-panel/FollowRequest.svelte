<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { followReqs, users, type FollowRequest } from "../stores";
  import { cn } from "$lib/utils";
  import { useGame } from "../hooks/useGame";
  import Button from "$lib/components/ui/button/button.svelte";

  const game = useGame();
  export let req: FollowRequest;
  $: desc = [t("chat.createPublic", $translations), t("chat.createPrivate", $translations), t("chat.joinPublic", $translations), t("chat.joinPrivate", $translations)];
  $: user = $users.find((u) => u.id === req.origin);
  $: descs = desc.filter((e, i) => req.events & (1 << i));
</script>

<div class={cn("p-2 pointer-events-auto bg-background rounded")}>
  <div class="w-full grid grid-cols-[1fr_auto] gap-1 items-center">
    <div class="font-bold truncate">{t("chat.followRequest", $translations)}</div>
  </div>
  <div class="break-words whitespace-pre-wrap text-ellipsis">
    <span>{t("chat.wantsToFollow", $translations).replace("{name}", user?.name ?? "")}</span>
    <div class="flex flex-col">
      {#each descs as desc}
        <span>- {desc}</span>
      {/each}
    </div>
    <div class="grid grid-cols-2 gap-2">
      <Button on:click={() => followReqs.dismiss(req)} variant="destructive">{t("chat.reject", $translations)}</Button>
      <Button
        on:click={() => {
          game.connection.chat(`/acceptfollowrequest ${req.rid}`);
          followReqs.dismiss(req);
        }}
        variant="default">{t("chat.accept", $translations)}</Button>
    </div>
  </div>
</div>
