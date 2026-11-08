<script context="module" lang="ts">
  export type VideoOptions = {
    size: number;
    duration: number;
    fps: number;
  };
</script>

<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label/index";

  export let onCancel: () => void;
  export let onSuccess: (response: VideoOptions) => void;

  const formData: VideoOptions = {
    size: 1_000,
    duration: 10,
    fps: 30,
  };
</script>

<Dialog.Header>
  <Dialog.Title>{t("modals.videoOptions", $translations)}</Dialog.Title>
</Dialog.Header>

<div class="grid w-full items-center gap-1.5">
  <Label for="roomname">{t("modals.largestDimension", $translations)}</Label>
  <Input type="number" id="largest-dimension" bind:value={formData.size} min="100" />
</div>

<div class="grid w-full items-center gap-1.5">
  <Label for="duration">{t("modals.duration", $translations)}</Label>
  <Input type="number" id="duration" bind:value={formData.duration} min="1" />
</div>

<div class="grid w-full items-center gap-1.5">
  <Label for="fps">{t("modals.fps", $translations)}</Label>
  <Input type="text" id="fps" bind:value={formData.fps} min="1" />
</div>

<Dialog.Footer>
  <Button on:click={onCancel} variant="outline">{t("common.cancel", $translations)}</Button>
  <Button type="submit" on:click={() => onSuccess(formData)}>{t("modals.record", $translations)}</Button>
</Dialog.Footer>
