<script lang="ts">
  import { onMount } from "svelte";
  export let key: string;

  let isVisible = true;

  // Check localStorage to see if the banner should be initially visible or hidden
  onMount(() => {
    const savedState = localStorage.getItem(key);
    if (savedState !== null) {
      isVisible = savedState === "true";
    }
  });

  // Function to toggle visibility and save state to localStorage
  function toggleVisibility() {
    isVisible = !isVisible;
    localStorage.setItem(key, isVisible.toString());
  }
</script>

<div class="bottom-right {isVisible ? '' : 'hidden'}">
  <button class="toggle-button" on:click={toggleVisibility}>
    {#if isVisible}
      &rarr;
    {:else}
      &larr;
    {/if}
  </button>
  <div class="content">
    <slot></slot>
  </div>
</div>

<style>
  .bottom-right {
    z-index: 8888;
    position: fixed;
    pointer-events: all;
    bottom: 20px;
    right: 20px;
    display: flex;
    align-items: center;
    transition: transform 0.3s ease;
  }

  .hidden {
    transform: translateX(calc(95%));
  }

  .toggle-button {
    cursor: pointer;
    background: #333;
    color: #fff;
    border: none;
    padding: 10px;
    border-radius: 50%;
    aspect-ratio: 1 / 1;
    width: 3em;
  }
</style>
