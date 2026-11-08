<script lang="ts" context="module">
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

  export type ItemElement = {
    icon: IconDefinition;
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
</script>

<script lang="ts">
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { draggable } from "@neodrag/svelte";
  import Fa from "svelte-fa";
  import { expoOut } from "svelte/easing";
  import { tweened } from "svelte/motion";

  export let initialPosition: { x: number; y: number } | undefined = undefined;
  export let onPositionChange: ((pos: { x: number; y: number }) => void) | undefined = undefined;
  export let items: ItemElement[];

  let open = false;
  let currentNode: HTMLElement;
  let attachedToRight = false;
  let attachedToBottom = false;

  $: nodeSizes = currentNode?.getBoundingClientRect();
  $: nodeSizes, updateInitialPosition();

  const safeOffset = 10;

  let position = tweened({ x: 0, y: 0 }, { easing: expoOut, duration: 400 });

  $: onPositionChange?.($position);

  function getNewPosition(offsetX: number, offsetY: number) {
    const maxPosition = getMaxPosition();
    const x = Math.min(Math.max(offsetX, safeOffset), maxPosition.x);
    const y = Math.min(Math.max(offsetY, safeOffset), maxPosition.y);

    attachedToRight = x === maxPosition.x;
    attachedToBottom = y === maxPosition.y;

    return { x, y };
  }

  function getMaxPosition() {
    return {
      x: innerWidth - nodeSizes.width - safeOffset,
      y: innerHeight - nodeSizes.height - safeOffset,
    };
  }

  function updateInitialPosition() {
    if (!nodeSizes) return;

    if (initialPosition) {
      const { x, y } = initialPosition;
      position.set(getNewPosition(x || 0, y || 0), { duration: 0 });
    } else {
      position.set(getNewPosition(0, innerHeight), { duration: 0 });
    }
  }

  function handleWindowSizeChange() {
    const current = $position;
    const newPosition = getNewPosition(attachedToRight ? innerWidth : current.x, attachedToBottom ? innerHeight : current.y);
    position.set(newPosition, { duration: 0 });
  }
</script>

<svelte:window on:resize={handleWindowSizeChange} />

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger asChild let:builder>
    <button
      use:builder.action
      {...builder}
      class="relative size-10 rounded-full outline-none pointer-events-auto backdrop-blur-[0px]"
      bind:this={currentNode}
      use:draggable={{
        bounds: "parent",
        position: $position,
        onDrag: (data) => {
          position.set({ x: data.offsetX, y: data.offsetY }, { duration: 0 });
        },
        onDragEnd(data) {
          $position = getNewPosition(data.offsetX, data.offsetY);
        },
      }}>
      <div class="absolute inset-0 rounded-full bg-gray-900"></div>
      <div class="absolute inset-1 rounded-full bg-gray-300"></div>
      <div class="absolute inset-1.5 rounded-full bg-gray-900"></div>
      <div class="absolute inset-3 rounded-full bg-gray-300"></div>
    </button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="w-auto">
    <DropdownMenu.Group>
      {#each items as item}
        <DropdownMenu.Item class="space-x-2" disabled={item.disabled} on:click={item.onClick}>
          <Fa icon={item.icon} />
          <span>{item.label}</span>
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Group>
  </DropdownMenu.Content>
</DropdownMenu.Root>
