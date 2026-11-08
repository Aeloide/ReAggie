<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import UserIcon from "$lib/components/UserIcon.svelte";
  import { pushState } from "$app/navigation";
  import { faBan } from "@fortawesome/free-solid-svg-icons/faBan";
  import { faEnvelope } from "@fortawesome/free-solid-svg-icons/faEnvelope";
  import { faGear } from "@fortawesome/free-solid-svg-icons/faGear";
  import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
  import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
  import { faUserGear } from "@fortawesome/free-solid-svg-icons/faUserGear";
  import { faUserSlash } from "@fortawesome/free-solid-svg-icons/faUserSlash";
  import { faVolumeMute } from "@fortawesome/free-solid-svg-icons/faVolumeMute";
  import { faBell } from "@fortawesome/free-solid-svg-icons/faBell";
  import Fa from "svelte-fa";
  import { derived, get } from "svelte/store";
  import { useGame } from "../hooks/useGame";
  import { activeMobilePrivateChatUserId, heldPieces, nameTags, otherSettings, privateConversations, roomDef, settings, users } from "../stores";
  import { getContext } from "svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import type { WhisperManager } from "$room/WhisperManager";
  import Button from "$lib/components/ui/button/button.svelte";
  import { chatInput } from "./chatInputStore";
  import type { User } from "$backend/types";

  const game = useGame();

  const listUsers = derived(users, (users) => {
    const clone = [...users];
    const self = clone.findIndex((x) => x.isMe);
    clone.unshift(...clone.splice(self, 1));
    return clone;
  });

  const gotoUser = (id: number) => {
    const target = get(nameTags).find((e) => e.user.id === id)!;
    if (!target) return;
    if (target.x === 0 && target.y === 0) return;
    game.actions.setViewPosCentered(target.x, target.y);
  };

  const warpable = (id: number) => {
    const target = get(nameTags).find((e) => e.user.id === id)!;
    if (!target) return false;
    if (target.x === 0 && target.y === 0) return false;
    return true;
  };

  const whisperManager = getContext<WhisperManager>("whisperlist");
</script>

<div id="users-list" class="overflow-y-auto max-h-[30vh] pointer-events-auto -mr-2">
  <div class="overflow-y-visible max-h-[50vh] flex flex-col gap-y-0.5">
    {#each $listUsers as user (user.id)}
      <div
        class="px-2 bg-background rounded"
        style:background={user.avatar
          ? `linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)),     url('/assets/pictures/${user.banner || user.avatar}') center / cover no-repeat black`
          : ""}>
        <div class="w-full grid grid-cols-[auto_1fr_auto] gap-1 items-center">
          <UserIcon {user} />
          <span class="truncate" title={user.name}>{user.name}</span>

          {#if user.isMe}
            <Button
              size="icon"
              class="rounded-full"
              variant="ghost"
              title={t("chat.userOptions", $translations)}
              on:click={() =>
                pushState("", {
                  showUserSettingsModal: {
                    show: true,
                  },
                })}>
              <Fa icon={faGear} />
            </Button>
          {:else}
            <div class="flex items-center gap-1">
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                on:click={() => gotoUser(user.id)}
                class="hidden sm:flex items-center gap-0.5 opacity-40 text-sm cursor-default"
                title={t("chat.piecesHeld", $translations)}>
                <span>{$heldPieces.get(user.id) || 0}</span>
                <Fa color={warpable(user.id) ? "#009eff" : "currentColor"} icon={faPuzzlePiece} size="sm" translateY="-0.05" />
              </div>
              <DropdownMenu.Root closeFocus={null}>
                <DropdownMenu.Trigger asChild let:builder>
                  <Button
                    size="icon"
                    variant="ghost"
                    class={"rounded-full " + (user.hasToken ? "text-yellow-500" : "")}
                    title={t("chat.actions", $translations)}
                    builders={[builder]}>
                    <Fa icon={faUserGear} />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  {#if $otherSettings.host.Kick}
                    <DropdownMenu.Item on:click={() => game.connection.kick(user.id, $settings.secretforthisroom)}>
                      <Fa icon={faBan} class="mr-2" />
                      Kick & block
                    </DropdownMenu.Item>
                  {/if}
                  {#if $otherSettings.host.Delegate}
                    <DropdownMenu.Item
                      on:click={() =>
                        pushState("", {
                          showUserPromotionModal: {
                            show: true,
                            userId: user.id,
                          },
                        })}>
                      <Fa icon={faStar} class="mr-2" />
                      {t("chat.promote", $translations)}
                    </DropdownMenu.Item>
                  {/if}
                  <DropdownMenu.Item
                    on:click={() => {
                      privateConversations.startConversationWithUser(user);
                      $activeMobilePrivateChatUserId = user.id;
                      // whisperManager.addWhisper(user);
                      // chatInput.setVisible(true);
                    }}>
                    <Fa icon={faEnvelope} class="mr-2" />
                    {t("chat.whisper", $translations)}
                  </DropdownMenu.Item>
                  {#if $settings.selected_token}
                    <DropdownMenu.Item
                      on:click={() => {
                        pushState("", {
                          showUserMuteModal: {
                            show: true,
                            userId: user.id,
                          },
                        });
                      }}>
                      <Fa icon={faVolumeMute} class="mr-2" />
                      {t("chat.muteUser", $translations)}
                    </DropdownMenu.Item>
                  {/if}
                  {#if $roomDef?.votekick}
                    <DropdownMenu.Item title={t("chat.voteKickTitle", $translations).replace("{name}", user.name)} on:click={() => game.connection.votekick(user.id)}>
                      <Fa icon={faUserSlash} class="mr-2" />
                      {t("chat.voteKick", $translations)}
                    </DropdownMenu.Item>
                  {/if}
                  {#if user.hasToken}
                    <DropdownMenu.Item
                      title={t("chat.followTitle", $translations).replace("{name}", user.name)}
                      on:click={() =>
                        pushState("", {
                          showUserFollowRequestModal: {
                            show: true,
                            userId: user.id,
                          },
                        })}>
                      <Fa icon={faBell} class="mr-2" />
                      {t("chat.follow", $translations)}
                    </DropdownMenu.Item>
                  {/if}
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
