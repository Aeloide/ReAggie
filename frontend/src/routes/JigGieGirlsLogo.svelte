<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import Live2D from "./playground/Live2D.svelte";

  export let type: "header" | "footer";

  let isDecember = new Date().getMonth() == 11;
  const isOctober = new Date().getMonth() == 9;

  if (isOctober) isDecember = false;

  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  const jc = Math.random() > 0.5 ? 1 : 2;
  const gc = Math.random() > 0.8 ? 1 : 2;

  let cont: HTMLDivElement;
  if (isDecember) document.body.classList.add("xmas");

  let jig: Live2D;
  let gie: Live2D;
  let jcmodel = Math.random() > 0.5 ? "deer/Jig-chan-Deer" : "sweater/Jig-chan-Sweater";
  let gcmodel = Math.random() > 0.5 ? "santa/Gie-chan-Santa" : "box/Gie-chan-Gift";
  onMount(async () => {
    if (!cont) return;
    document.body.append(cont);
    if (isDecember) {
      for (let i = 0; i < 200; ++i) {
        const snow = document.createElement("div");
        snow.classList.add("snow");
        let initialX = Math.random() * 100;
        let initialY = Math.random() * 100;
        let flutterW = lerp(2, 4, Math.random());
        const scale = Math.random();
        snow.style.opacity = "" + Math.random() * scale;
        snow.animate(
          [
            {
              transform: `translateX(${initialX - flutterW}vw)  scale(${scale})`,
            },
            {
              transform: `translateX(${initialX + flutterW}vw)  scale(${scale})`,
            },
          ],
          {
            direction: "alternate",
            fill: "both",
            iterations: Number.POSITIVE_INFINITY,
            duration: lerp(2000, 5000, Math.random()),
            easing: "ease-in-out",
          },
        );
        snow.animate(
          [
            {
              top: `${initialY - 100}vh`,
            },
            {
              top: `${initialY + 100}vh`,
            },
          ],
          { direction: "normal", fill: "both", iterations: Number.POSITIVE_INFINITY, duration: lerp(10000, 20000, Math.random()), easing: "linear" },
        );
        cont.appendChild(snow);
      }
    }
    if (!jig) return;
    if (!gie) return;
    await Promise.all([jig.ready, gie.ready]);
    console.log("both ready");
    let prev = performance.now();
    requestAnimationFrame(function raf(nt) {
      const dt = (nt - prev) / 1000;
      prev = nt;
      gie.update?.(dt);
      jig.update?.(dt);
      requestAnimationFrame(raf);
    });
  });

  onDestroy(() => {
    if (cont) cont.remove();
  });
</script>

{#if !isDecember && !isOctober && type == "header"}
  <div bind:this={cont} class="snowcontainer">
    <div class="woowee absolute top-[0px] hidden md:flex w-full h-96 justify-between">
      <img alt="jig-chan" src={`/jc${jc}.webp`} />
      <span class="w-[64rem]"></span>
      <img alt="gie-chan" src={`/gc${gc}.webp`} />
    </div>
  </div>
{:else if isOctober}
  <div bind:this={cont} class="snowcontainer">
    <div class="woowee floating absolute top-[0px] hidden md:flex w-full h-96 justify-between">
      <Live2D bind:this={jig} modelName={"JIG/Bansheeg_chan"}></Live2D>
      <span class="w-[64rem]"></span>
      <Live2D bind:this={gie} modelName={"GIE/Kittiie-chan"}></Live2D>
    </div>
  </div>
{:else if isDecember}
  <div bind:this={cont} class="snowcontainer">
    <div class="woowee floating absolute top-[0px] hidden md:flex w-full h-96 justify-between">
      <Live2D bind:this={jig} modelName={jcmodel}></Live2D>
      <span class="w-[64rem]"></span>
      <Live2D bind:this={gie} modelName={gcmodel}></Live2D>
    </div>
  </div>
{/if}

<style>
  @keyframes wave-y {
    /* Start position */
    0%,
    100% {
      transform: translateY(0px);
    }
    /* Peak displacement (24px upwards) */
    50% {
      transform: translateY(-24px);
    }
  }

  .floating {
    animation: wave-y 4s ease-in-out infinite;
  }

  .snowcontainer {
    position: fixed;
    top: 0;
    overflow: hidden;
    width: 100vw;
    height: 100vh;
    z-index: -1;
  }

  .woowee {
    z-index: 100;
    width: 100vw;
    left: 0;
    justify-content: space-evenly;
  }
  @keyframes float {
    0% {
      transform: translate(0, 0px);
    }
    50% {
      transform: translate(0px, -15px);
    }
    100% {
      transform: translate(0, 0px);
    }
  }
</style>
