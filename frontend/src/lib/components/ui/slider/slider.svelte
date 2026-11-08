<script lang="ts">
	import { Slider as SliderPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	type $$Props = SliderPrimitive.Props & { showTicks?: boolean };

	let className: $$Props["class"] = undefined;
	export let showTicks: $$Props["showTicks"] = false;
	export let value: $$Props["value"] = [0];
	export { className as class };
</script>

<SliderPrimitive.Root
	bind:value
	class={cn("relative flex w-full touch-none select-none items-center", className)}
	{...$$restProps}
	let:thumbs
	let:ticks
>
	<span class="bg-primary/20 relative h-1.5 w-full grow overflow-hidden rounded-full">
		<SliderPrimitive.Range class="bg-primary absolute h-full" />
	</span>
	{#each thumbs as thumb}
		<SliderPrimitive.Thumb
			{thumb}
			class="border-primary/50 bg-background focus-visible:ring-ring block h-4 w-4 z-10 rounded-full border shadow transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50"
		/>
	{/each}

	{#if showTicks}
		{#each ticks as tick}
			<SliderPrimitive.Tick {tick} class="translate-y-[8px] h-[5px] z-0 w-[1px] bg-primary/40" />
		{/each}
	{/if}
</SliderPrimitive.Root>
