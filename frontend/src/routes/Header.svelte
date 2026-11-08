<script lang="ts">
  import Fa from "svelte-fa";
  import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
  import { locale, setLocale, t, translations } from "$lib/i18n";
</script>

<div class="relative mx-auto">
  <div class="text-blue-400/30">
    <span class="absolute top-16 -left-12 opacity-10">
      <Fa icon={faPuzzlePiece} rotate="-25" size="4x" />
    </span>
    <span class="absolute top-4 left-12 md:left-40 opacity-10 md:opacity-15">
      <Fa icon={faPuzzlePiece} rotate="-15" size="5x" />
    </span>

    <span class="absolute -top-2 -right-14 opacity-10">
      <Fa icon={faPuzzlePiece} rotate="25" size="4x" />
    </span>
    <span class="absolute -top-10 right-12 md:right-40 opacity-10 md:opacity-15">
      <Fa icon={faPuzzlePiece} rotate="15" size="5x" />
    </span>
  </div>

  <div class="grid grid-cols-1 gap-4 text-center z-10">
    <h1 class="text-4xl md:text-5xl font-bold">
      <a class="bg-gradient-to-br from-blue-600 to-cyan-300 bg-clip-text text-transparent box-decoration-clone" href="/">{t("site.title", $translations)}</a>
    </h1>
    <p class="px-6 z-10">{t("site.description", $translations)}</p>
    <div class="flex justify-center items-center gap-2 text-sm" aria-label={t("site.language", $translations)}>
      <button
        type="button"
        class:font-bold={$locale === "ru"}
        aria-pressed={$locale === "ru"}
        on:click={() => setLocale("ru")}
      >{t("site.russian", $translations)}</button>
      <span aria-hidden="true">|</span>
      <button
        type="button"
        class:font-bold={$locale === "en"}
        aria-pressed={$locale === "en"}
        on:click={() => setLocale("en")}
      >{t("site.english", $translations)}</button>
    </div>
  </div>
</div>
