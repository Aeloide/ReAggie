<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { onMount, onDestroy } from "svelte";

  export let currentSlide = 0;
  let totalSlides = 0;
  let slidesEl: HTMLElement;
  let containerEl: HTMLElement; // For swipe detection

  let touchStartX = 0;
  let touchEndX = 0;
  const swipeThreshold = 50; // Minimum distance for a swipe

  function nextSlide() {
    currentSlide = (currentSlide + 1) % totalSlides;
  }

  function prevSlide() {
    currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      nextSlide();
    } else if (event.key === "ArrowLeft") {
      prevSlide();
    }
  }

  function handleTouchStart(event: TouchEvent) {
    touchStartX = event.touches[0].clientX;
  }

  function handleTouchMove(event: TouchEvent) {
    touchEndX = event.touches[0].clientX;
  }

  function handleTouchEnd() {
    if (touchStartX - touchEndX > swipeThreshold) {
      nextSlide();
    } else if (touchEndX - touchStartX > swipeThreshold) {
      prevSlide();
    }
    // Reset values
    touchStartX = 0;
    touchEndX = 0;
  }

  onMount(() => {
    if (slidesEl) {
      totalSlides = slidesEl.children.length;
    }
    window.addEventListener("keydown", handleKeyDown);
    if (containerEl) {
      // Add touch listeners only if containerEl is available
      containerEl.addEventListener("touchstart", handleTouchStart, { passive: true });
      containerEl.addEventListener("touchmove", handleTouchMove, { passive: true });
      containerEl.addEventListener("touchend", handleTouchEnd, { passive: true });
    }
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeyDown);
    if (containerEl) {
      containerEl.removeEventListener("touchstart", handleTouchStart);
      containerEl.removeEventListener("touchmove", handleTouchMove);
      containerEl.removeEventListener("touchend", handleTouchEnd);
    }
  });
</script>

<div class="slides-container" bind:this={containerEl} role="region" aria-label={t("lorecomics.carousel", $translations)}>
  <div class="slides" bind:this={slidesEl} style="transform: translateX(-{currentSlide * 100}%); transition: transform 0.4s ease-in-out;">
    <slot />
  </div>
  <div class="slide-counter">
    {currentSlide + 1} / {totalSlides}
  </div>
  {#if totalSlides > 1}
    <button class="nav-button prev" on:click={prevSlide} aria-label={t("lorecomics.prevSlide", $translations)}>‹</button>
    <button class="nav-button next" on:click={nextSlide} aria-label={t("lorecomics.nextSlide", $translations)}>›</button>
  {/if}
</div>

<style>
  .slides-container {
    position: relative;
    overflow: hidden;
    width: 100%;
    user-select: none; /* Prevent text selection during swipe */
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }

  .slides {
    display: flex;
    /* transition is now inline for smoother updates */
  }

  /* Direct descendant selector for Slide component */
  .slides > :global(.slide) {
    /* Updated to correctly target slotted .slide components */
    flex: 0 0 100%;
    min-width: 100%; /* Ensures slides don't shrink */
  }

  .nav-button {
    position: absolute;
    top: 40%; /* Adjusted to be less likely to cover central image content */
    transform: translateY(-50%);
    font-size: 3em; /* Increased size */
    font-weight: bold;
    background: rgba(0, 0, 0, 0.3); /* Semi-transparent background */
    color: rgba(255, 255, 255, 0.9); /* Brighter text color */
    border: none;
    cursor: pointer;
    padding: 0; /* Adjusted for circle */
    width: 50px; /* Fixed width for circle */
    height: 50px; /* Fixed height for circle */
    border-radius: 50%; /* Circular buttons */
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
  }

  .nav-button:hover {
    background: rgba(0, 0, 0, 0.6);
    color: white;
  }

  .prev {
    left: 10px;
  }

  .next {
    right: 10px;
  }

  .slide-counter {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 5px 15px;
    border-radius: 15px;
    font-size: 1.1em;
    z-index: 10;
    font-weight: bold;
  }
</style>
