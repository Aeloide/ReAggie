<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { cn } from "$lib/utils";
  import { faEyeDropper } from "@fortawesome/free-solid-svg-icons/faEyeDropper"; // Using lucide-svelte for icons, ensure it's installed
  import Fa from "svelte-fa";

  export let colors: string[] = [];
  export let value: string; // This is two-way bound from the parent component

  let customColorInput: HTMLInputElement;

  // Reactive statement to determine if the current 'value' is a custom color
  // (i.e., not one of the predefined 'colors')
  $: isCustomColorActive = value && !colors.includes(value);

  function openCustomColorPicker() {
    // Programmatically click the hidden input type="color"
    customColorInput?.click();
  }

  // Utility function to determine if a hex color is light or dark
  // This helps in choosing a contrasting color for the icon
  function isColorLight(hexColor: string): boolean {
    if (!hexColor || hexColor.length < 7) { // Basic check for valid hex color
      // Default for invalid or short hex strings (e.g. empty string, '#fff')
      // Consider empty string as light background, needing dark icon
      return true; 
    }
    try {
      const r = parseInt(hexColor.substring(1, 3), 16);
      const g = parseInt(hexColor.substring(3, 5), 16);
      const b = parseInt(hexColor.substring(5, 7), 16);
      // HSP (Highly Sensitive Poo) equation from http://alienryderflex.com/hsp.html
      const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
      return hsp > 127.5; // Threshold between light and dark
    } catch (e) {
      // In case of parsing error (e.g. invalid hex characters)
      console.error("Error parsing color for isColorLight:", e);
      return true; // Default to light background
    }
  }

  // Reactive statement for the icon's stroke color, ensuring contrast
  $: iconStrokeColor = isCustomColorActive && value 
    ? (isColorLight(value) ? 'hsl(var(--foreground))' : 'hsl(var(--background))') 
    : 'hsl(var(--muted-foreground))';

</script>

<div class="flex flex-wrap gap-1 items-center">
  {#each colors as color (color)}
    <button
      type="button"
      class={cn(
        "size-5 rounded-full border-2 border-transparent transition-all", // Base style for consistent size
        "hover:border-primary", // Hover state
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary", // Focus state for accessibility
        value === color && "ring-2 ring-primary ring-offset-1 ring-offset-background !border-primary" // Active state: show ring and ensure border is primary
      )}
      style:background-color={color}
      on:click={() => (value = color)}
      aria-label={`Select color ${color}`}
      title={color}
    />
  {/each}

  <!-- Custom Color Picker Button -->
  <div class="relative">
    <button
      type="button"
      class={cn(
        "size-5 rounded-full border-2 flex items-center justify-center transition-all", // Base style
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary", // Focus state
        isCustomColorActive && value
          ? "ring-2 ring-primary ring-offset-1 ring-offset-background !border-primary" // Active custom color: show ring, primary border
          : "border-input bg-background hover:border-primary hover:bg-accent" // Inactive state: standard input border, subtle background, hover effects
      )}
      style={isCustomColorActive && value ? `background-color: ${value};` : ''} 
      on:click={openCustomColorPicker}
      aria-label={t("colors.custom", $translations)}
      title={isCustomColorActive && value ? `Custom color: ${value}` : "Pick custom color"}
    >
      <Fa icon={faEyeDropper}
        class="size-3"
        color={iconStrokeColor}
      />
    </button>
    <input
      type="color"
      bind:this={customColorInput}
      bind:value={value}
      class="absolute w-0 h-0 opacity-0 -z-10 pointer-events-none" 
      tabindex="-1"
      aria-hidden="true"
    />
  </div>
</div>