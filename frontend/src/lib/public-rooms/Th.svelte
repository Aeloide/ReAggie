<script lang="ts">
  import type { DataHandler, Field, Row } from "@vincjo/datatables";
  import * as Table from "$lib/components/ui/table";
  import { cn } from "$lib/utils";

  type T = $$Generic<Row>;

  export let handler: DataHandler<T>;
  export let orderBy: Field<T>;
  export let centered: boolean = false;

  const identifier = orderBy?.toString();
  const sort = handler.getSort();

  $: isSortActive = $sort.identifier === identifier;
</script>

<Table.Head
  on:click={() => handler.sort(orderBy)}
  class={cn({
    "table-sort-asc": isSortActive && $sort.direction === "asc",
    "table-sort-dsc": isSortActive && $sort.direction === "desc",
    "cursor-pointer": orderBy,
    "variant-soft-primary": isSortActive,
    "text-center": centered,
  })}
  title={$$restProps.title}>
  <slot />
</Table.Head>
