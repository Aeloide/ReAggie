<script lang="ts">
  // No script needed for this simple version if imageFitMode is handled by parent
</script>

<div class="slide">
  <slot />
</div>

<style>
  .slide {
    width: 100%;
    flex-shrink: 0;
    box-sizing: border-box; /* Ensure padding doesn't affect width */
    /* Padding can be added here if needed for all slides, or in the content itself */
    /* padding: 0 10px; */ /* Example padding */
  }
</style>