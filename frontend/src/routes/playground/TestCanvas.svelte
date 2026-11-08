<script lang="ts">
  import { onMount } from "svelte";
  import { doShit } from "./bezier";

  let canv: HTMLCanvasElement;
  onMount(() => {
    doShit(canv);
  });
</script>

<canvas width="512" height="512" bind:this={canv}></canvas>