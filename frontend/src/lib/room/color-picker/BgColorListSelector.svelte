<script lang="ts">
  import ColorPickerSelector from "./ColorPickerSelector.svelte";

  export let color: string;

  // prettier-ignore
  const bgColors = [
    "#222222",
    "#666666",
    "#bbbbbb",
    "#7592ac",
    "#5f9ea0",
    "#4682b4",
    "#8fbc8f",
    "#517151",
    "#a68836",
    "#896262",
    "#593e3e",
  ];
</script>

<ColorPickerSelector colors={bgColors} bind:value={color} />
