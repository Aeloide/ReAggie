<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import BgColorListSelector from "./BgColorListSelector.svelte";
  import { Label } from "$lib/components/ui/label";
  import BgTextureSelector from "./BgTextureSelector.svelte";

  export let color: string;
  export let texture: string;
  export let dynamic: boolean;
  export let showTexturePicker: boolean;

  export let onPickerClick: (color: string, texture: string) => void;
</script>

{#if showTexturePicker && !dynamic}
  <BgTextureSelector bind:texture />
{/if}

<div>
  <Label>{t("colors.background", $translations)}</Label>

  {#if dynamic}
    <button
      type="button"
      class="rounded-sm translate-y-1 h-5 w-10 ring-1 ring-primary ml-2"
      style:background-color={color}
      on:click={() => onPickerClick(color, texture)} />
  {:else}
    <BgColorListSelector bind:color />
  {/if}
</div>
