<script lang="ts">
  import { onMount } from "svelte";
  import { ParticleEffect, ParticleEngine } from "./ParticleEngine";

  let canvas: HTMLCanvasElement;

  onMount(() => {
      const ctx = canvas.getContext("webgl2")!;
      ctx.clear(ctx.COLOR_BUFFER_BIT);

      const partEngine = new ParticleEngine(ctx);
      const eff = partEngine.effectSpawner(ParticleEffect);
      eff.spawn();
    })

</script>

<canvas tabindex="0" class="absolute left-0 top-0 size-full" bind:this={canvas} />
