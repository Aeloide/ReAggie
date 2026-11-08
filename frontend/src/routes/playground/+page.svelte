<script lang="ts">
  import { onMount } from "svelte";
  import Live2D from "./Live2D.svelte";

  let jig: Live2D;
  let gie: Live2D;
  onMount(async () => {
    await Promise.all([jig.ready, gie.ready]);
    let prev = performance.now();
    requestAnimationFrame(function raf(nt) {
      const dt = (nt - prev) / 1000;
      prev = nt;
      gie.update?.(dt);
      jig.update?.(dt);
      requestAnimationFrame(raf);
    });
  });
</script>

<svelte:head>
  <meta name="robots" content="noindex nofollow" />
  <html lang="en" />
</svelte:head>

<div class="container flex mx-auto max-w-4xl my-4">
  <Live2D bind:this={jig} modelName={"JIG/Bansheeg_chan"}></Live2D>
  <Live2D bind:this={gie} modelName={"GIE/Kittiie-chan"}></Live2D>
</div>

<style scoped>
  canvas {
    border: 1px solid red;
  }
</style>
