<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { pushState } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { otherSettings, pollStore, settings } from "$lib/room/stores";
  import { fixRectangle, type vec2 } from "$room/vec2";
  import { faBars } from "@fortawesome/free-solid-svg-icons/faBars";
  import { faCheckCircle } from "@fortawesome/free-solid-svg-icons/faCheckCircle";
  import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons/faCircleQuestion";
  import { faCompress } from "@fortawesome/free-solid-svg-icons/faCompress";
  import { faExpand } from "@fortawesome/free-solid-svg-icons/faExpand";
  import { faGear } from "@fortawesome/free-solid-svg-icons/faGear";
  import { faPoll } from "@fortawesome/free-solid-svg-icons/faPoll";
  import { faSquarePlus } from "@fortawesome/free-solid-svg-icons/faSquarePlus";
  import { faTableList } from "@fortawesome/free-solid-svg-icons/faTableList";
  import { faWrench } from "@fortawesome/free-solid-svg-icons/faWrench";
  import { faClockRotateLeft } from "@fortawesome/free-solid-svg-icons/faClockRotateLeft";
  import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
  import { faEyeSlash } from "@fortawesome/free-solid-svg-icons/faEyeSlash";
  import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons/faTriangleExclamation";
  import { faHourglassHalf } from "@fortawesome/free-solid-svg-icons/faHourglassHalf";
  import Fa from "svelte-fa";
  import { slide } from "svelte/transition";
  import { useGame } from "../hooks/useGame";
  import PollModal from "../modals/poll-modal/PollModal.svelte";
  import ZoneGuide from "../ZoneGuide.svelte";
  import type { PollManager } from "$room/EntityManager";

  import { faThumbtack } from "@fortawesome/free-solid-svg-icons/faThumbtack";
  import { faTrash } from "@fortawesome/free-solid-svg-icons/faTrash";
  import { faBroom } from "@fortawesome/free-solid-svg-icons/faBroom";
  import type { Note } from "$room/types";
  import { notesStore } from "$lib/room/stores";
  import NoteGuide from "../NoteGuide.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";

  const game = useGame();

  let zoneguide = false;
  let question = "";
  let options: string[] = [];

  // Notes Logic
  let showNotesList = false;
  let showNoteGuide = false;
  let currentNote: Note = {
    id: -1,
    text: "",
    color: "#ffffff",
    align: "center",
    region: [
      [NaN, NaN],
      [NaN, NaN],
    ],
    scale: 1,
  };

  function addNote() {
    currentNote = {
      id: -1,
      text: "",
      color: "#ffffff",
      align: "center",
      region: [
        [NaN, NaN],
        [NaN, NaN],
      ],
      scale: 1,
    };
    showNoteGuide = true;
  }

  function editNote(note: Note) {
    currentNote = { ...note }; // clone
    showNoteGuide = true;
  }

  let showDeleteNoteDialog = false;
  let showClearNotesDialog = false;
  let noteIdToDelete = -1;

  function deleteNote(id: number) {
    noteIdToDelete = id;
    showDeleteNoteDialog = true;
  }

  function doDeleteNote() {
    if (noteIdToDelete !== -1) {
      game.connection.chat(`/delnote ${noteIdToDelete}`);
      noteIdToDelete = -1;
    }
  }

  function clearNotes() {
    showClearNotesDialog = true;
  }

  function doClearNotes() {
    game.connection.chat(`/clearallnotes`);
  }

  let showDeleteRoomDialog = false;

  function doDeleteRoom() {
    game.connection.chat(`/del`);
  }

  function saveNote(note: Note) {
    if (note.id !== -1) {
      game.connection.chat(`/delnote ${note.id}`);
    }
    const r = note.region;
    // /addnote x1 y1 x2 y2 text;color;align
    const rectFlat = fixRectangle(r)
      .flat()
      .map((e) => ~~e)
      .join(" ");
    const params = `${note.text};${note.color};${note.align};${note.scale || 1}`;
    game.connection.chat(`/addnote ${rectFlat} ${params}`);
    showNoteGuide = false;
    showNotesList = true; // show list after adding
  }

  async function startPoll() {
    if ($settings.renderer != "gpu4") {
      if (!confirm(t("menu.needGpu", $translations))) return;
      settings.update((s) => {
        s.renderer = "gpu4";
        return s;
      });
      location.reload();
      return;
    }

    pushState("", { showPollModal: true });
  }

  function stopPoll() {
    game.connection.chat("/stoppoll");
  }

  async function guideEnded(val: CustomEvent<{ ok: true } | undefined>) {
    zoneguide = false;
    const pollm = game.entities[3];
    const setup = pollm.zones;
    if (val.detail?.ok) {
      game.connection.chat(`/startpoll ${question};${options.join(";")}`);
      for (let z of pollm.zones) {
        game.connection.chat(
          `/setupZone ${fixRectangle(z[1])
            .flat()
            .map((e) => ~~e)
            .join(" ")}`,
        );
      }
    } else {
      pollm.zones.length = 0;
    }
  }

  function prepareRevert() {
    console.log("pushed");
    pushState("", { showRevertModal: true });
  }

  document.documentElement.onfullscreenchange = () => {
    if (document.fullscreenElement) {
      fullscreenIcon = faCompress;
    } else {
      fullscreenIcon = faExpand;
    }
  };
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }
  $: fullscreenIcon = faExpand;
</script>

<AlertDialog.Root bind:open={showDeleteNoteDialog}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{t("menu.deleteNote", $translations)}</AlertDialog.Title>
      <AlertDialog.Description>{t("menu.cannotUndo", $translations)}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>{t("common.cancel", $translations)}</AlertDialog.Cancel>
      <AlertDialog.Action on:click={doDeleteNote}>{t("common.delete", $translations)}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={showDeleteRoomDialog}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{t("menu.deleteRoom", $translations)}</AlertDialog.Title>
      <AlertDialog.Description>
        {t("menu.deleteRoomConfirm", $translations)}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>{t("common.cancel", $translations)}</AlertDialog.Cancel>
      <AlertDialog.Action on:click={doDeleteRoom}>{t("common.delete", $translations)}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={showClearNotesDialog}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{t("menu.deleteAllNotes", $translations)}</AlertDialog.Title>
      <AlertDialog.Description>{t("menu.deleteAllNotesConfirm", $translations)}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>{t("common.cancel", $translations)}</AlertDialog.Cancel>
      <AlertDialog.Action on:click={doClearNotes}>{t("menu.deleteAll", $translations)}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<PollModal
  onSuccess={(response) => {
    question = response.question;
    options = response.options;
    zoneguide = true;
  }} />

<DropdownMenu.Root>
  <DropdownMenu.Trigger asChild let:builder>
    <Button size="icon-menu" variant="outline" title={t("menu.menu", $translations)} id="room-menu" builders={[builder]}>
      <Fa icon={faBars} />
    </Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenu.Item href="/?new">
      <Fa icon={faSquarePlus} class="mr-2" />
      {t("menu.newRoom", $translations)}
    </DropdownMenu.Item>
    <DropdownMenu.Item href="/">
      <Fa icon={faTableList} class="mr-2" />
      {t("menu.publicRooms", $translations)}
    </DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item
      on:click={() =>
        pushState("", {
          showUserSettingsModal: {
            show: true,
          },
        })}>
      <Fa icon={faGear} class="mr-2" />
      {t("menu.userSettings", $translations)}
    </DropdownMenu.Item>
    {#if $otherSettings.host.ChangeRoomSettings}
      <DropdownMenu.Item on:click={() => pushState("", { showRoomSettingsModal: true })}>
        <Fa icon={faWrench} class="mr-2" />
        {t("menu.roomSettings", $translations)}
      </DropdownMenu.Item>
    {/if}
    <DropdownMenu.Item on:click={() => pushState("", { showHelpModal: true })}>
      <Fa icon={faCircleQuestion} class="mr-2" />
      {t("menu.help", $translations)}
    </DropdownMenu.Item>
    {#if $otherSettings.host.Poll}
      {#if $pollStore.question}
        <DropdownMenu.Item on:click={stopPoll}>
          <Fa icon={faCheckCircle} class="mr-2" />
          {t("menu.stopPoll", $translations)}
        </DropdownMenu.Item>
      {:else if !zoneguide}
        <DropdownMenu.Item on:click={startPoll}>
          <Fa icon={faPoll} class="mr-2" />
          {t("menu.poll", $translations)}
        </DropdownMenu.Item>
      {/if}
    {/if}
    {#if $otherSettings.host.Notes}
      <DropdownMenu.Item
        on:click={() => {
          showNotesList = true;
        }}>
        <Fa icon={faThumbtack} class="mr-2" />
        {t("menu.manageNotes", $translations)}
      </DropdownMenu.Item>
    {/if}
    {#if $otherSettings.host.Rollback}
      <DropdownMenu.Item on:click={prepareRevert}>
        <Fa icon={faClockRotateLeft} class="mr-2" />
        {t("menu.revert", $translations)}
      </DropdownMenu.Item>
    {/if}
    {#if $otherSettings.host.Cleanup}
      <DropdownMenu.Item on:click={() => game.connection.raw({ type: "cleanup_layout" })}>
        <Fa icon={faBroom} class="mr-2" />
        {t("menu.cleanupLayout", $translations)}
      </DropdownMenu.Item>
    {/if}
    {#if $otherSettings.host.Delete}
      <DropdownMenu.Item
        on:click={() => {
          showDeleteRoomDialog = true;
        }}>
        <Fa icon={faTrash} class="mr-2" />
        {t("menu.deleteThisRoom", $translations)}
      </DropdownMenu.Item>
    {/if}
    {#if $otherSettings.host.Lock}
      <DropdownMenu.Item on:click={() => game.connection.chat("/lock")}>
        <Fa icon={faLock} class="mr-2" />
        {t("menu.lockRoom", $translations)}
      </DropdownMenu.Item>
    {/if}
    {#if $otherSettings.host.RoomCreator}
      <DropdownMenu.Item on:click={() => game.connection.chat("/togglepublic")}>
        <Fa icon={faEyeSlash} class="mr-2" />
        {t("menu.togglePublic", $translations)}
      </DropdownMenu.Item>
      <DropdownMenu.Item on:click={() => game.connection.chat("/setnsfw")}>
        <Fa icon={faTriangleExclamation} class="mr-2" />
        {t("menu.setNsfw", $translations)}
      </DropdownMenu.Item>
    {/if}
    {#if $otherSettings.host.SlowMode}
      <DropdownMenu.Item on:click={() => game.connection.chat("/slowmode")}>
        <Fa icon={faHourglassHalf} class="mr-2" />
        {t("menu.toggleSlowmode", $translations)}
      </DropdownMenu.Item>
    {/if}
    <DropdownMenu.Item on:click={toggleFullscreen}>
      <Fa icon={fullscreenIcon} class="mr-2" />
      {t("menu.toggleFullscreen", $translations)}
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

{#if zoneguide}
  <div transition:slide={{ duration: 150 }} class="absolute bottom-0 left-[50%] translate-x-[-50%] pb-1">
    <ZoneGuide on:cancel={guideEnded} {options} />
  </div>
{/if}

{#if showNotesList}
  <div
    transition:slide={{ duration: 150 }}
    class="absolute bottom-0 left-0 p-4 bg-background border rounded-tr-xl shadow-xl flex flex-col gap-2 max-h-[50vh] overflow-y-auto w-64">
    <div class="flex justify-between items-center">
      <h3 class="font-bold">{t("menu.notes", $translations)}</h3>
      <Button variant="ghost" size="icon" on:click={() => (showNotesList = false)}>X</Button>
    </div>
    <Button size="sm" on:click={addNote}>{t("menu.addNote", $translations)}</Button>
    {#each $notesStore.notes as note}
      <div class="flex justify-between items-center border p-1 rounded">
        <span class="truncate text-sm flex-1" style:color={note.color}>{note.text}</span>
        <div class="flex gap-1">
          <Button variant="ghost" class="w-6 h-6 p-0" on:click={() => editNote(note)}>
            <Fa icon={faWrench} size="xs" />
          </Button>
          <Button variant="ghost" class="w-6 h-6 p-0" on:click={() => deleteNote(note.id)}>
            <Fa icon={faTrash} size="xs" />
          </Button>
        </div>
      </div>
    {/each}
    {#if $notesStore.notes.length > 0}
      <Button size="sm" variant="destructive" on:click={clearNotes}>{t("menu.clearAll", $translations)}</Button>
    {/if}
  </div>
{/if}

{#if showNoteGuide}
  <div transition:slide={{ duration: 150 }} class="absolute bottom-0 left-[50%] translate-x-[-50%] pb-1">
    <NoteGuide bind:note={currentNote} on:cancel={() => (showNoteGuide = false)} on:save={(e) => saveNote(e.detail.note)} />
  </div>
{/if}
