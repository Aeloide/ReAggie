<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { onMount, onDestroy } from "svelte";
  let cont: HTMLDivElement;
  export let rate: number; // Number of sparkles per second

  let sparkles: any[] = [];

  let interval: ReturnType<typeof setInterval>;
  let gid = 0;
  let living = new Set<number>();
  let dead = new Set<number>();
  function addSparkle() {
    // Get the container's dimensions
    const rect = cont.getBoundingClientRect();

    // Generate a random position within the container
    const x = Math.random() * rect.width;
    const y = 0; // Start at the top

    let id = 0;
    if (dead.size != 0) {
      id = dead.values().next().value!;
      dead.delete(id);
    } else {
      id = gid++;
    }

    living.add(id);

    // Add the new sparkle to the array
    sparkles = [...sparkles, { id, x, y }];
  }

  function removeSparkle(id: number) {
    sparkles = sparkles.filter((s) => s.id !== id);
    living.delete(id);
    dead.add(id);
  }

  onMount(() => {
    // Start spawning sparkles at the specified rate
    interval = setInterval(
      () => {
        addSparkle();
      },
      1000 / (rate * 10),
    );
  });

  onDestroy(() => {
    // Clean up the interval when the component is destroyed
    clearInterval(interval);
  });
</script>

<div class="lecont" bind:this={cont}>
  <slot />

  {#each sparkles as sparkle (sparkle.id)}
    <img
      src={`/sparkle.gif?t=${sparkle.id}`}
      alt={t("post.sparkle", $translations)}
      class="sparkle"
      on:animationend={() => removeSparkle(sparkle.id)}
      style="left: {sparkle.x}px; top: {sparkle.y}px;" />
  {/each}
</div>

<style>
  img {
    image-rendering: pixelated;
  }
  .sparkle {
    position: absolute;
    width: 20px;
    height: 20px;
    animation: fall 3s linear forwards;
  }

  @keyframes fall {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(100px);
      opacity: 0;
    }
  }

  .lecont {
    position: relative;
  }
</style>
