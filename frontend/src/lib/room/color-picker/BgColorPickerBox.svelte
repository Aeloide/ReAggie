<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { bgColorPicker } from "../stores";
  import BgColorListSelector from "./BgColorListSelector.svelte";
  import { useGame } from "../hooks/useGame";
  import { pushState } from "$app/navigation";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { GPU4Renderer } from "$room/gpu4-renderer";
  import BgTextureSelector from "./BgTextureSelector.svelte";

  export let color: string;
  export let texture: string = "";

  const initialColor = color;
  const initialTexture = texture;

  const game = useGame();

  const setRendererOptions = (color: string, texture: string) => {
    if (!game?.renderer) {
      return;
    }

    game.renderer.setBgCol(color);
    if (game.renderer instanceof GPU4Renderer) {
      game.renderer.setBgTexture(texture);
    }
  };

  $: setRendererOptions(color, texture);

  const updateColor = (target: any) => {
    color = target.value as string;
  };

  function onSubmit(success: boolean) {
    const resColor = success ? color : initialColor;
    const resTexture = success ? texture : initialTexture;
    setRendererOptions(resColor, resTexture);

    bgColorPicker.hidePicker();
    pushState("", { showUserSettingsModal: { show: true, bgColor: resColor, bgTexture: resTexture } });
  }
</script>

<Card.Root>
  <Card.Content class="flex flex-col gap-3 px-3 my-3 py-0">
    <BgTextureSelector bind:texture />
    <Label>{t("colors.background", $translations)}</Label>
    <BgColorListSelector bind:color />
    <input type="color" class="w-full h-8 border cursor-pointer" bind:value={color} on:input={(x) => updateColor(x.target)} />
  </Card.Content>
  <Card.Footer class="grid grid-flow-col justify-stretch gap-2 p-3">
    <Button variant="outline" on:click={() => onSubmit(false)}>{t("common.cancel", $translations)}</Button>
    <Button on:click={() => onSubmit(true)}>{t("colors.apply", $translations)}</Button>
  </Card.Footer>
</Card.Root>
