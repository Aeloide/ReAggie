<script lang="ts">
  import { Slider } from "$lib/components/ui/slider";

  export let autism: number;

  interface TextPair {
    short: string;
    full: string;
  }

  const texts: TextPair[] = [
    {
      short: "I hate autists",
      full: "Pieces will be shittily scattered, ensuring maximum autistic rage",
    },
    {
      short: "Not at all",
      full: "Pieces will be mildly scattered, still ensuring maximum autistic rage",
    },
    {
      short: "Very",
      full: "Pieces will be neatly arranged, appeasing the autists",
    },
  ];

  let vals = [autism];
  $: autism = vals[0];
</script>
