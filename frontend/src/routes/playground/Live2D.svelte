<svelte:options accessors />

<script lang="ts">
  import { onMount } from "svelte";

  // import "./live2dcubismcore";
  // import * as live2d from "../../CubismSdk/Framework/src/live2dcubismframework";
  // import { CubismModel } from "../../CubismSdk/Framework/src/model/cubismmodel";
  // import { CubismMatrix44 } from "@framework/math/cubismmatrix44";
  // import * as safegl from "safe-gl";
  // import { CubismUserModel } from "@framework/model/cubismusermodel";
  // import { CubismMotionManager } from "@framework/motion/cubismmotionmanager";
  // import { csmVector } from "@framework/type/csmvector";
  import live2dwrapper from "./live2dwrapper?worker";

  export let modelName: string;
  export let width: number = 768;
  export let height: number = 768;

  let canv: HTMLCanvasElement;

  export let update = (dt: number) => {
    // alert('shouldnt happen')
  };

  let inited: Function;
  export const ready = new Promise((_) => {
    inited = _;
  });

  let worker: Worker;
  onMount(async () => {
    // worker = new Worker(new URL("./live2dworker.ts", import.meta.url), { type: "module" });

    worker = new live2dwrapper();
    worker.onerror = (e) => {
      console.error(e.message);
    };
    // console.log(worker, live2dworker);
    // worker.addEventListener()
    const ofc = canv.transferControlToOffscreen();
    const p = new Promise<void>((_) => {
      worker.addEventListener(
        "message",
        (ev) => {
          console.log(ev);
          if (ev.data === "loaded") _();
        },
        { once: true },
      );
    });
    await p;
    worker.postMessage({ modelName, ofc }, [ofc]);
    // console.log("sent to worker");
    worker.addEventListener(
      "message",
      (ev) => {
        if (ev.data === "inited") inited?.();
      },
      { once: true },
    );
    update = function raf(dt) {
      worker.postMessage(dt);
    };
    // inited?.();
  });
</script>

<canvas bind:this={canv} {width} {height} id="bepis"></canvas>
