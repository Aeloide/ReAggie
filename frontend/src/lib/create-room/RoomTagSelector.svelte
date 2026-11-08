<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Popover from "$lib/components/ui/popover";
  import { cn, flyAndScale } from "$lib/utils";
  import { faXmark } from "@fortawesome/free-solid-svg-icons/faXmark";
  import { createTagsInput } from "@melt-ui/svelte";
  import Fa from "svelte-fa";

  export let tags: string[] = [];

  const MAX_TAG_LENGTH = 15;
  let inputRef: HTMLInputElement = null!;

  const {
    elements: { root, input, tag, deleteTrigger },
    states: { tags: tagsState, inputValue },
    helpers: { addTag },
  } = createTagsInput({
    defaultTags: tags,
    unique: true,
    editable: false,
    maxTags: 5,
    trim: true,
    add(tag) {
      return { id: tag, value: tag.substring(0, MAX_TAG_LENGTH) };
    },
    addOnPaste: true,
  });

  $: inputRef && input(inputRef);
  $: tags = $tagsState.map((t) => t.value);

  let open = false;

  function onFocusOut(e: FocusEvent) {
    const btn = e.relatedTarget as HTMLButtonElement;
    if (!btn?.dataset?.tag) {
      open = false;
      return;
    }

    e.preventDefault();
  }

  const predefinedTags = ["Artistic", "Acoustic", "Autistic", "Animal", "Anime", "Cute", "Food", "Funny", "Landscape", "Portrait"];

  $: tagsWithoutSelected = predefinedTags.filter((x) => !$tagsState.map((t) => t.value).includes(x));
  $: suggestedTags =
    $inputValue.length > 0 ? tagsWithoutSelected.filter((x) => x.toLowerCase().startsWith($inputValue.toLowerCase())) : tagsWithoutSelected;
</script>

<div class="grid w-full gap-1.5">
  <Label for="tags">
    <span>{t("createRoom.tags", $translations)}</span>
    <span class="text-muted-foreground">{t("createRoom.beNice", $translations)}</span>
  </Label>

  <Popover.Root closeOnOutsideClick={false} closeOnEscape={false} disableFocusTrap={true} bind:open>
    <Popover.Trigger asChild let:builder>
      <div {...builder} class="flex flex-col gap-1.5">
        <Input
          {...$input}
          on:focusin={() => (open = true)}
          on:focusout={onFocusOut}
          id="tags"
          bind:ref={inputRef}
          maxlength={MAX_TAG_LENGTH}
          spellcheck={false}
          placeholder={t("createRoom.tagPlaceholder", $translations)} />

        {#if $tagsState.length > 0}
          <div {...$root} use:root class="flex flex-row flex-wrap gap-1">
            {#each $tagsState as t}
              <div
                {...$tag(t)}
                use:tag
                {...$deleteTrigger(t)}
                use:deleteTrigger
                transition:flyAndScale
                class={cn(
                  "focus:ring-ring inline-flex select-none items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
                  "bg-slate-700 hover:bg-slate-800 text-foreground/80 px-1.5",
                )}>
                <span class="flex items-center px-1.5">{t.value}</span>
                <Fa icon={faXmark} />
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </Popover.Trigger>
    <Popover.Content sameWidth class="p-0 flex flex-col max-h-40 overflow-auto">
      {#each suggestedTags as tag (tag)}
        <button
          type="button"
          class="w-full px-3 py-1.5 text-sm text-start hover:bg-secondary"
          data-tag={tag}
          on:click={() => {
            addTag(tag);
            open = false;
            inputRef.focus();
          }}>
          {tag}
        </button>
      {/each}
    </Popover.Content>
  </Popover.Root>
</div>
