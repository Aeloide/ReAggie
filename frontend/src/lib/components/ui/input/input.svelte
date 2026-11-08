<script lang="ts">
	import type { HTMLInputAttributes } from "svelte/elements";
	import type { InputEvents } from "./index.js";
	import { cn } from "$lib/utils.js";

	type $$Props = HTMLInputAttributes & { ref?: HTMLInputElement };
	type $$Events = InputEvents;

	let className: $$Props["class"] = undefined;
	export let value: $$Props["value"] = undefined;
	export { className as class };

	export let ref: $$Props["ref"] = undefined;

	// Workaround for https://github.com/sveltejs/svelte/issues/9305
	// Fixed in Svelte 5, but not backported to 4.x.
	export let readonly: $$Props["readonly"] = undefined;
</script>

<input
	class={cn(
		"border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	bind:value
	{readonly}
	bind:this={ref}
	on:blur
	on:change
	on:click
	on:focus
	on:focusin
	on:focusout
	on:keydown
	on:keypress
	on:keyup
	on:mouseover
	on:mouseenter
	on:mouseleave
	on:mousemove
	on:paste
	on:input
	on:wheel|passive
	{...$$restProps}
/>
