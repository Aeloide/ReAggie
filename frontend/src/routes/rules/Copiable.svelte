<script lang="ts">
  let spanElement: HTMLSpanElement;
  let currentTitle: string = "click to copy"; // Store initial title

  function copyContent() {
    if (spanElement && spanElement.textContent) {
      navigator.clipboard
        .writeText(spanElement.textContent)
        .then(() => {
          // Provide feedback that text was copied
          currentTitle = "Copied!";
          if (spanElement) spanElement.focus(); // Briefly focus to show outline if any

          setTimeout(() => {
            currentTitle = "click to copy"; // Reset title
          }, 1500);
        })
        .catch((err) => {
          console.error("Failed to copy text: ", err);
          currentTitle = "Copy failed!";
          setTimeout(() => {
            currentTitle = "click to copy"; // Reset title
          }, 2000);
        });
    }
  }

  // This function handles keyboard events for accessibility
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); // Prevent default space scroll or enter submit
      copyContent();
    }
  }
</script>

<span bind:this={spanElement} class={$$props.class} title={currentTitle} on:click={copyContent} on:keydown={handleKeydown} role="button" tabindex="0">
  <slot />
</span>
