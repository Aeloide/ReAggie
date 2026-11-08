<script lang="ts">
  import type { User } from "$room/game";
  import { cn } from "$lib/utils";
  import type { Process } from "../stores";
  import { useGame } from "../hooks/useGame";

  export let proc: Process;
  export let me: User | undefined;

  let root: HTMLDivElement;
  let game = useGame();

  function updateHooks(){
    const forms = root.querySelectorAll("form");
    forms.forEach(
      (f) =>
        (f.onsubmit = (e) => {
          e.preventDefault();
          let pl: any = {};
          for (let [k, v] of new FormData(f, e.submitter)) pl[k] = v;
          const submitter = (e.submitter as HTMLInputElement);
          pl["sub"] = submitter.value;
          game.connection.wsClient?.send((e) => ({
            type: "proc",
            id: proc.id,
            pl
          }));
          submitter.disabled = true;
        }),
    );
  }

  let code: string = '';
  proc.code.subscribe(s => code = s);
  $: code && root && updateHooks()
</script>

<div bind:this={root} class={cn("process p-2 pointer-events-auto bg-background rounded", {})}>
  {@html code}
</div>
