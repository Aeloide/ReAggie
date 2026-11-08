<script lang="ts">
  import CodeMirror from "svelte-codemirror-editor";
  import { javascript } from "@codemirror/lang-javascript";
  import { oneDark } from "@codemirror/theme-one-dark";

  export let code: string = "";
  export let disabled: boolean = false;
</script>

<div class="border rounded-md overflow-hidden bg-slate-900 border-slate-700 {disabled ? 'opacity-50 pointer-events-none' : ''}">
  <CodeMirror
    bind:value={code}
    lang={javascript()}
    theme={oneDark}
    styles={{
      "&": {
        height: "200px",
      },
    }}
    readonly={disabled} />
</div>
