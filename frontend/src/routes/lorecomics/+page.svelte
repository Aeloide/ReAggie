<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Separator from "$lib/components/ui/separator/separator.svelte";
  import Footer from "../Footer.svelte";
  import Slide from "./Slide.svelte";
  import Slides from "./Slides.svelte";
  import duo from "$lib/assets/duo.webp"; // Ensure this path is correct
  import { onMount } from "svelte";
  import { getComic, getUrl } from "$lib/index";

  interface Comic {
    description: string;
    filepath: string;
  }

  let slides: { id: number; src: string; l: string }[] = [];
  let currentSlide = 0;

  onMount(async () => {
    try {
      const res = await fetch(getUrl("/api/comic"));
      const data: Comic[] = await res.json();
      slides = data
        .map((c, i) => ({
          id: i,
          src: getComic(c.filepath),
          l: c.description,
        }))
        .reverse();
      if (slides.length > 0) {
        currentSlide = slides.length - 1;
      }
    } catch (e) {
      console.error("Failed to load comics", e);
    }
  });

  let imageFitMode: "height" | "width" = "height";

  function toggleImageFitMode() {
    imageFitMode = imageFitMode === "height" ? "width" : "height";
  }
</script>

<svelte:head>
  <meta name="robots" content="noindex nofollow" />
  <title>{t("lorecomics.title", $translations)}</title>
</svelte:head>

<section class="container mx-auto max-w-4xl my-4">
  <div class="flex flex-col text-center px-2 gap-y-4 mt-4">
    <h1 class="text-4xl font-bold text-red-500">{t("lorecomics.title", $translations)}</h1>
    <div class="wrap">
      <img class="duo" src={duo} alt="Duo aesthetic" />
      <div class="bg-background p-4 sm:p-8 space-y-4 border">
        <Separator />
        <p>
          {t("lorecomics.intro", $translations)}
        </p>
        <Separator />
        {#if slides.length > 0}
          <Slides bind:currentSlide>
            {#each slides as l (l.id)}
              <Slide>
                <div class="comic-slide-content">
                  <img
                    src={l.src}
                    alt={`Comic ${l.id + 1}`}
                    class:fit-height={imageFitMode === "height"}
                    class:fit-width={imageFitMode === "width"} />
                  <p class="comic-explanation text-lg">{@html l.l}</p>
                </div>
              </Slide>
            {/each}
          </Slides>
        {/if}
        <div class="controls-footer mt-4 text-center">
          <button on:click={toggleImageFitMode} class="image-fit-toggle-button">
            {t("lorecomics.toggle", $translations)}{imageFitMode === "height" ? t("lorecomics.height", $translations) : t("lorecomics.width", $translations)})
          </button>
        </div>
      </div>
    </div>
  </div>
</section>

<Footer />

<style>
  .duo {
    position: absolute;
    top: 0;
    transform: translateY(-100%);
    z-index: -1;
    /* Consider adjusting size or position for different screen sizes if it overlaps negatively */
    left: 50%;
    transform: translateX(-50%) translateY(-100%); /* Centering and positioning above */
    max-width: 100%; /* Prevent it from being too wide */
  }
  .wrap {
    position: relative;
    /* highly scientific */
    margin-top: 200px; /* Adjusted this based on typical image heights */
  }

  @media (min-width: 640px) {
    /* sm breakpoint */
    .wrap {
      margin-top: 350px; /* Original margin for larger screens */
    }
  }

  .comic-explanation {
    /* Changed from p to allow more specific targeting */
    text-align: justify;
  }

  .comic-slide-content {
    display: flex;
    gap: 1.5em; /* Reduced gap slightly */
    flex-direction: column;
    align-items: center; /* Center image and text block */
    padding-bottom: 1em; /* Space for slide counter if it overlaps */
  }

  /* Styling for the image within the slide */
  .comic-slide-content img {
    display: block; /* Remove extra space below image */
    margin-left: auto; /* Center image if it's narrower than container */
    margin-right: auto;
  }

  .comic-slide-content img.fit-height {
    max-height: 80vh; /* Adjusted to give more space for explanation and controls */
    width: auto;
    max-width: 100%; /* Ensure it doesn't overflow container width */
  }

  .comic-slide-content img.fit-width {
    max-width: 100%;
    height: auto;
    max-height: none; /* Remove height restriction */
  }

  .text-lg :global(a) {
    text-decoration: underline !important; /* Ensure links are clearly identifiable */
    color: var(--link-color, #007bff) !important; /* Use a variable or a specific color */
  }
  .text-lg :global(a:hover) {
    text-decoration: none !important;
  }

  .image-fit-toggle-button {
    padding: 0.5em 1em;
    border: 1px solid #ccc;
    background-color: #f0f0f0;
    cursor: pointer;
    border-radius: 4px;
    font-size: 0.9em;
    color: #333;
  }
  .image-fit-toggle-button:hover {
    background-color: #e0e0e0;
  }
</style>
