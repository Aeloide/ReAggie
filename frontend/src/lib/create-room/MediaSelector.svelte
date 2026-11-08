<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { createEventDispatcher } from "svelte";
  import ImageSelectorElement from "./MediaSelectorElement.svelte";
  import type { MediaItem, PreviewItem } from "./types";
  import Fa from "svelte-fa";
  import { faFileArrowUp } from "@fortawesome/free-solid-svg-icons/faFileArrowUp";
  import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
  import { clamp } from "../../utils";

  export let files: FileList | undefined = undefined;

  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const MAX_FILE_COUNT = 64;
  const dispatch = createEventDispatcher<{
    mediaLoad: MediaItem[];
    error: { text: string };
  }>();

  let draggingFile = false;
  let isHovered = false;
  let objectURLs: string[] = [];
  let mediaItems: MediaItem[] = [];
  let fileInput: HTMLInputElement;
  let appendFileInput: HTMLInputElement;

  let previewItems: PreviewItem[] = [];

  async function handleInputFiles(append = false, inputFiles?: FileList) {
    draggingFile = false;

    const sourceFiles = inputFiles || (append ? appendFileInput.files! : fileInput.files!);
    if (!sourceFiles || sourceFiles.length === 0) {
      // empty files indicates that the user cancelled picking files
      restorePreviousFiles();
      return;
    }

    const dt = new DataTransfer();
    if (append && files) {
      for (let i = 0; i < files.length; i++) dt.items.add(files[i]);
    }
    for (let i = 0; i < sourceFiles.length; i++) dt.items.add(sourceFiles[i]);

    const combinedFiles = dt.files;

    if (combinedFiles.length > MAX_FILE_COUNT) {
      handleInvalidInput(t("createRoom.tooManyFiles", $translations).replace("{max}", String(MAX_FILE_COUNT)));
      return;
    }

    let resItems: PreviewItem[] = [];
    for (let i = 0; i < sourceFiles.length; i++) {
      const file = sourceFiles[i];

      const isImage = ["image/png", "image/jpeg"].includes(file.type);
      const isVideo = ["video/webm", "video/mp4"].includes(file.type);
      if (!isImage && !isVideo) {
        handleInvalidInput(t("createRoom.invalidFormat", $translations));
        resItems.forEach((x) => URL.revokeObjectURL(x.objectUrl));
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        const sizeInMb = (MAX_FILE_SIZE / (1024 * 1024)).toFixed();
        handleInvalidInput(t("createRoom.fileTooBig", $translations).replace("{size}", sizeInMb));
        resItems.forEach((x) => URL.revokeObjectURL(x.objectUrl));
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      resItems.push({
        isImage,
        objectUrl: objectUrl,
        size: file.size,
      });
    }

    if (append) {
      mediaItems = [...mediaItems, ...new Array(resItems.length)];
      previewItems = [...previewItems, ...resItems];
      objectURLs = [...objectURLs, ...resItems.map((x) => x.objectUrl)];
    } else {
      mediaItems = [...new Array(resItems.length)];
      previewItems = resItems;
      objectURLs.forEach(URL.revokeObjectURL);
      objectURLs = resItems.map((x) => x.objectUrl);
    }

    files = combinedFiles;
    fileInput.files = combinedFiles;
  }

  function onMediaLoad(e: CustomEvent<MediaItem>, idx: number) {
    mediaItems[idx] = e.detail;
    if (mediaItems.every((e) => e)) {
      dispatch("mediaLoad", [...mediaItems]);
    }
  }

  function handleInvalidInput(errorMessage: string) {
    dispatch("error", { text: t("createRoom.errorPrefix", $translations).replace("{message}", errorMessage) });
    restorePreviousFiles();
  }

  function restorePreviousFiles() {
    fileInput.files = createFileList(files);
  }

  function createFileList(payload: FileList | undefined) {
    const dataTransfer = new DataTransfer();
    if (!payload) {
      return dataTransfer.files;
    }

    for (let i = 0; i < payload.length; i++) {
      const file = payload.item(i);
      if (file) {
        dataTransfer.items.add(file);
      }
    }

    return dataTransfer.files;
  }

  function handlePaste(event: ClipboardEvent) {
    const pastedFiles = event.clipboardData?.files;
    if (!pastedFiles?.length) {
      return;
    }

    handleInputFiles(isHovered, pastedFiles);
  }

  function getGridCols(length: number) {
    return clamp(Math.ceil(length / 4), 2, 8);
  }
</script>

<svelte:window on:paste={handlePaste} />

<label class="label" on:mouseenter={() => (isHovered = true)} on:mouseleave={() => (isHovered = false)}>
  <div class="w-full relative border-2 rounded-lg bg-muted {draggingFile ? 'shadow-[0_0_0_2px_rgb(var(--primary)/1)]' : ''}">
    <input
      class="input absolute size-full opacity-0 cursor-pointer"
      type="file"
      accept="image/png,image/jpeg,video/mp4,video/webm"
      required
      multiple
      bind:this={fileInput}
      on:change={() => handleInputFiles()}
      on:dragenter={() => (draggingFile = true)}
      on:dragleave={() => (draggingFile = false)} />

    {#if previewItems.length}
      <ImageSelectorElement item={previewItems[0]} on:mediaLoad={(d) => onMediaLoad(d, 0)} on:error />
    {:else}
      <div class="w-full pointer-events-none flex flex-col justify-center items-center h-80">
        <Fa icon={faFileArrowUp} size="4x" />
        <strong class="mt-4">{t("createRoom.uploadFile", $translations)}</strong>
        <small class="opacity-75"> {t("createRoom.uploadHint", $translations)} </small>
        <small class="opacity-50">{t("createRoom.uploadOnly", $translations)}</small>
      </div>
    {/if}

    <div
      class="absolute inset-1 grid gap-1 pointer-events-none"
      style:grid-template-columns={`repeat(${getGridCols(previewItems.length)}, minmax(0, 1fr))`}>
      {#each previewItems.slice(1) as previewItem, idx}
        <div class="relative">
          <ImageSelectorElement
            item={previewItem}
            on:mediaLoad={(d) => onMediaLoad(d, 1 + idx)}
            on:error
            extraClasses="w-full h-full absolute rounded-lg object-contain" />
        </div>
      {/each}
    </div>

    {#if previewItems.length}
      <button
        type="button"
        class="absolute bottom-4 right-4 size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:brightness-110 z-10"
        on:click|preventDefault={() => appendFileInput.click()}>
        <Fa icon={faPlus} size="2x" />
      </button>
    {/if}
  </div>
</label>

<input
  type="file"
  accept="image/png,image/jpeg,video/mp4,video/webm"
  multiple
  bind:this={appendFileInput}
  on:change={() => handleInputFiles(true)}
  class="hidden" />
