<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { createEventDispatcher, onDestroy, tick } from "svelte";
  import { settings } from "../../stores";
  import ColorPickerSelector from "../../color-picker/ColorPickerSelector.svelte";
  import type { UserSettingsFormData } from "../../types";
  import BgColorPickerSettingsElement from "../../color-picker/BgColorPickerSettingsElement.svelte";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Slider } from "$lib/components/ui/slider";
  import { Separator } from "$lib/components/ui/separator";
  import Checkbox from "$lib/create-room/Checkbox.svelte";
  import ObsoleteRendererIcon from "./ObsoleteRendererIcon.svelte";
  import Gizmo from "./Gizmo.svelte";

  export let forcedValues: Partial<UserSettingsFormData> = {};
  export let dynamicBgColorPicker: boolean = false;
  export let onBgColorPickerClick: (color: string, texture: string) => void = () => {};

  let formData = getFormDataFromSettings(settings.snapshot());
  let form: HTMLFormElement;

  const dispatch = createEventDispatcher<{
    submit: { data: UserSettingsFormData };
  }>();

  function getFormDataFromSettings(s: ReturnType<typeof settings.snapshot>): UserSettingsFormData {
    return {
      name: s.savedname,
      color: s.savedcolor,
      bg: s.savedbgcol,
      bgTexture: s.savedbgtexture,
      hideusers: s.hideusers === "y",
      hidechat: s.hidechat === "y",
      hidenametags: s.hidenametags === "y",
      mutesounds: s.mutesound === "y",
      mutechat: s.mutechat === "y",
      imblind: s.imblind === "y",
      piecePickMode: s.piecePickMode,
      renderer: s.renderer,
      antialias: s.antialias as 0,
      particle: s.particle,
      hideosc: s.hideosc,
      hideshadow: s.hideshadow,
      forcedesync: s.forcedesync,
      gamingmode: s.gamingmode,
      bingotoken: s.bingotoken || "",
      shadowQuality: s.shadowQuality,
      shadowLightPos: s.shadowLightPos,
      persistentShadowGizmo: s.persistentShadowGizmo,
      ...forcedValues,
    };
  }

  const unsubscribeSettings = settings.subscribe((s) => {
    formData = getFormDataFromSettings(s);
  });

  onDestroy(() => {
    unsubscribeSettings();
  });

  export function requestSubmitForm() {
    if (form.requestSubmit) {
      form.requestSubmit();
    } else {
      const fakeSubmitBtn = document.createElement("button");
      fakeSubmitBtn.type = "submit";
      fakeSubmitBtn.style.display = "none";
      form.appendChild(fakeSubmitBtn);
      fakeSubmitBtn.click();
      fakeSubmitBtn.remove();
    }
  }

  async function onFormSubmit(event: Event) {
    event.preventDefault();

    // name shouldn't be empty
    if (formData.name.trim().length === 0) {
      formData.name = "";
      await tick();
      // delegate validation to the form (via "required" attribute)
      requestSubmitForm();
      return;
    }

    settings.update((s) => {
      s.savedname = formData.name;
      s.savedcolor = formData.color;
      s.savedbgcol = formData.bg;
      s.savedbgtexture = formData.bgTexture;
      s.hideusers = formData.hideusers ? "y" : "";
      s.hidechat = formData.hidechat ? "y" : "";
      s.hidenametags = formData.hidenametags ? "y" : "";
      s.mutesound = formData.mutesounds ? "y" : "";
      s.mutechat = formData.mutechat ? "y" : "";
      s.imblind = formData.imblind ? "y" : "";
      s.piecePickMode = formData.piecePickMode;
      s.renderer = formData.renderer;

      s.antialias = formData.antialias;
      s.particle = formData.particle;
      s.hideosc = formData.hideosc;
      s.hideshadow = formData.hideshadow;
      s.forcedesync = formData.forcedesync;
      s.gamingmode = formData.gamingmode;
      s.bingotoken = formData.bingotoken;
      s.shadowQuality = formData.shadowQuality;
      s.shadowLightPos = formData.shadowLightPos;
      s.persistentShadowGizmo = formData.persistentShadowGizmo;
      return s;
    });

    dispatch("submit", { data: formData });
  }

  const colors = [
    "#ff5bb6",
    "#de3bff",
    "#cc78ff",
    "#9879ff",
    "#5c57ec",
    "#4676ff",
    "#46baff",
    "#2cf7d5",
    "#40ffb1",
    "#37d973",
    "#3db74c",
    "#97ff40",
    "#f4f41a",
    "#ffda40",
    "#ffaf00",
    "#ff7200",
    "#ff4043",
    "#d71010",
  ];

  let antialiasVals = [formData.antialias];
  $: formData.antialias = antialiasVals[0];
</script>

<form class="space-y-3 sm:space-y-4" bind:this={form} on:submit={onFormSubmit}>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Left Column: General Settings -->
    <div class="space-y-3 sm:space-y-4 min-w-0">
      <div class="grid w-full items-center gap-1.5">
        <Label for="name">{t("settings.yourName", $translations)}</Label>
        <Input id="name" spellcheck="false" maxlength={30} placeholder={t("settings.namePlaceholder", $translations)} required bind:value={formData.name} />
      </div>

      <div class="grid w-full items-center gap-1.5">
        <Label for="bingotoken">{t("settings.bingoToken", $translations)}</Label>
        <Input id="bingotoken" spellcheck="false" maxlength={100} placeholder={t("settings.bingoTokenPlaceholder", $translations)} bind:value={formData.bingotoken} />
      </div>

      <div class="grid w-full items-center gap-1.5">
        <Label class="w-auto">{t("settings.yourColor", $translations)}</Label>
        <ColorPickerSelector {colors} bind:value={formData.color} />
      </div>

      <BgColorPickerSettingsElement
        bind:color={formData.bg}
        bind:texture={formData.bgTexture}
        showTexturePicker={formData.renderer === "gpu4"}
        dynamic={dynamicBgColorPicker}
        onPickerClick={onBgColorPickerClick} />

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Checkbox id="hideusers" label={t("settings.hideUsers", $translations)} bind:checked={formData.hideusers} />
        <Checkbox id="mutesounds" label={t("settings.muteSounds", $translations)} bind:checked={formData.mutesounds} />
        <Checkbox id="hide-chat-log" label={t("settings.hideChat", $translations)} bind:checked={formData.hidechat} />
        <Checkbox id="mute-chat-only" label={t("settings.muteChat", $translations)} bind:checked={formData.mutechat} />
        <Checkbox id="hide-name-tags" label={t("settings.hideNameTags", $translations)} bind:checked={formData.hidenametags} />
        <Checkbox id="imblind" label={t("settings.zoom2x", $translations)} bind:checked={formData.imblind} />
      </div>

      <div>
        <Label>{t("settings.pickMethod", $translations)}</Label>
        <Tabs.Root bind:value={formData.piecePickMode}>
          <Tabs.List class="w-full grid grid-cols-2 h-auto">
            <Tabs.Trigger class="py-2" value="hold">{t("settings.holdButton", $translations)}</Tabs.Trigger>
            <Tabs.Trigger class="py-2" value="click">{t("settings.clickButton", $translations)}</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </div>
    </div>

    <!-- Right Column: Rendering Settings -->
    <div class="space-y-3 sm:space-y-4 min-w-0">
      <div>
        <Label>{t("settings.renderingMode", $translations)}</Label>
        <Tabs.Root bind:value={formData.renderer}>
          <Tabs.List class="w-full grid grid-cols-1 sm:grid-cols-3 h-auto">
            <Tabs.Trigger class="py-2" value="gpu4">{t("settings.rendererQuality", $translations)}</Tabs.Trigger>
            <Tabs.Trigger class="py-2" value="gpu">
              <div class="relative">
                {t("settings.rendererGpu", $translations)}
                <ObsoleteRendererIcon />
              </div>
            </Tabs.Trigger>
            <Tabs.Trigger class="py-2" value="cpu">
              <div class="relative">
                {t("settings.rendererCpu", $translations)}
                <ObsoleteRendererIcon />
              </div>
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </div>

      {#if formData.renderer == "gpu4"}
        <div class="flex flex-col gap-2">
          <div class="flex justify-between items-center text-sm">
            <span>{t("settings.antialiasing", $translations)}</span>
            <span class="font-semibold">{formData.antialias ? `${formData.antialias} / 8` : t("settings.off", $translations)}</span>
          </div>

          <Slider class="py-2" bind:value={antialiasVals} min={0} max={8} step={2} showTicks />

          <div class="flex flex-col gap-1">
            <Checkbox id="forcedesync" label={t("settings.forceDesync", $translations)} bind:checked={formData.forcedesync} />
          </div>

          <div class="flex flex-col gap-1">
            <Checkbox id="gamingmode" label={t("settings.gamingMode", $translations)} bind:checked={formData.gamingmode} />
          </div>

          <div class="flex flex-col gap-1">
            <Checkbox id="hideshadows" label={t("settings.hideShadows", $translations)} bind:checked={formData.hideshadow} />
          </div>

          {#if !formData.hideshadow}
            <div class="ml-6 flex flex-col gap-2">
              <div class="w-full">
                <Tabs.Root bind:value={formData.shadowQuality}>
                  <Tabs.List class="w-full grid grid-cols-1 sm:grid-cols-2 h-auto">
                    <Tabs.Trigger class="py-2" value="approximate">{t("settings.shadowApproximate", $translations)}</Tabs.Trigger>
                    <Tabs.Trigger class="py-2" value="accurate">{t("settings.shadowAccurate", $translations)}</Tabs.Trigger>
                  </Tabs.List>
                </Tabs.Root>
              </div>

              {#if formData.shadowQuality === "accurate"}
                <div class="flex flex-col gap-2 p-2 border rounded-md">
                  <Label>{t("settings.lightPosition", $translations)}</Label>
                  <div class="flex gap-4 items-center">
                    <Gizmo bind:value={formData.shadowLightPos} />
                    <div class="flex flex-col gap-1">
                      <Checkbox id="psg" label={t("settings.persistentGizmo", $translations)} bind:checked={formData.persistentShadowGizmo} />
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <div class="flex flex-col gap-1">
            <Checkbox id="hideosc" label={t("settings.hideOscillation", $translations)} bind:checked={formData.hideosc} />
          </div>

          <!-- <label for="bepis">Particle effects</label>
            <RangeSlider min={0} max={10} name="particle" bind:value={formData.particle} step={1} label="bepis"></RangeSlider> -->
        </div>
      {/if}
    </div>
  </div>
  <Separator class="hidden sm:block" />
</form>
