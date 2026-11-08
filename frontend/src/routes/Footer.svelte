<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import Fa from "svelte-fa";
  import { faGitAlt } from "@fortawesome/free-brands-svg-icons/faGitAlt";
  import { faXTwitter } from "@fortawesome/free-brands-svg-icons/faXTwitter";
  import { faEnvelope } from "@fortawesome/free-solid-svg-icons/faEnvelope";
  import {
    faPalette,
    faPlusCircle,
    faTable,
    faKey,
    faCog,
    faPlus,
    faFileImport,
    faFileExport,
    faAngleRight,
    faCheck,
    faWrench,
    faTimes,
    faTrash,
    faDownload,
  } from "@fortawesome/free-solid-svg-icons";
  import { deferredPrompt } from "$lib/pwaStore";
  import { faGlobe } from "@fortawesome/free-solid-svg-icons/faGlobe";
  import { faHandcuffs } from "@fortawesome/free-solid-svg-icons/faHandcuffs";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Popover, Toggle } from "bits-ui"; // Main popover for setup actions

  import { Separator } from "$lib/components/ui/separator";
  import { flyAndScale } from "$lib/utils";
  import { aids } from "../utils";
  import { settings } from "$lib/room/stores";
  import ColorPickerSelector from "$lib/room/color-picker/ColorPickerSelector.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";

  // Melt UI Dialog for new token name
  import { createDialog, melt } from "@melt-ui/svelte";
  import { writable } from "svelte/store";
  import { faDiscord } from "@fortawesome/free-brands-svg-icons/faDiscord";

  const CHARSET = "0123456789abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randstring = (n: number) => [...new Array(n)].map(() => CHARSET[~~(Math.random() * CHARSET.length)]).join("");

  type Token = { name: string; val: string; username?: string; color?: string };

  const colors = [
    "#ff5bb6",
    "#de3bff",
    "#cc78ff",
    "#9879ff",
    "#5c57ec",
    "#4676ff",
    "#46baff",
    "#2cf7d5",
    "#40ffb1",
    "#37d973",
    "#3db74c",
    "#97ff40",
    "#f4f41a",
    "#ffda40",
    "#ffaf00",
    "#ff7200",
    "#ff4043",
    "#d71010",
  ];

  async function getStats(): Promise<{ active: number; freespace: string; unique_players: number; last_comic_timestamp: number } | undefined> {
    try {
      const response = await fetch("/stats");
      return await response.json();
    } catch (error) {
      console.error("Error fetching stats:", error);
      return undefined;
    }
  }

  $: activeToken = $settings.tokens.find((t) => t.val === $settings.selected_token);
  $: buttonText = activeToken ? activeToken.name : t("footer.setup", $translations);
  $: buttonVariant = (activeToken ? "secondary" : "ghost") as "secondary" | "ghost";
  $: buttonIcon = activeToken ? faKey : faCog;

  let setupPopoverOpen = false;
  let copyExportFeedback = "";
  let copyExportFailed = false;
  let importErrorFeedback = "";
  let generalFeedback = "";

  function clearFeedbacks() {
    copyExportFeedback = "";
    copyExportFailed = false;
    importErrorFeedback = "";
    generalFeedback = "";
  }

  // --- New Token Name Dialog Logic ---
  const newTokenNameDialogOpenStore = writable(false); // This is our primary control store
  let newTokenFormData = {
    name: "",
    username: "",
    color: "",
  };
  let newTokenNameDialogError = "";

  const {
    elements: {
      // trigger: newTokenNameDialogTrigger, // We might not use a visible trigger
      overlay: newTokenNameDialogOverlay,
      content: newTokenNameDialogContent,
      title: newTokenNameDialogTitle,
      close: newTokenNameDialogClose, // Builder for a close button
      portalled: newTokenNameDialogPortalled,
    },
    states: { open: newTokenNameDialogActualOpen }, // We'll react to our writable store
  } = createDialog({
    open: newTokenNameDialogOpenStore, // Pass our writable store
    preventScroll: true,
  });

  let resolveNewTokenNamePromise: (value: { name: string; username: string; color: string } | null) => void;
  let isTokenNamePromisePending = false;

  // Svelte 4: Reactive statement to handle dialog closure by ESC or overlay click
  // This block runs when $newTokenNameDialogOpenStore or isTokenNamePromisePending changes.
  $: {
    if (!$newTokenNameDialogOpenStore && isTokenNamePromisePending) {
      // If dialog store is set to closed by external means (ESC, overlay via Melt UI setting our store),
      // and promise was pending (meaning not closed via our explicit Save/Cancel buttons).
      resolveNewTokenNamePromise?.(null);
      isTokenNamePromisePending = false;
    }
  }

  async function promptForTokenNameWithDialog(): Promise<{ name: string; username: string; color: string } | null> {
    clearFeedbacks();
    newTokenFormData = {
      name: t("footer.defaultSetupName", $translations).replace("{n}", String($settings.tokens.length + 1)),
      username: $settings.savedname || "",
      color: $settings.savedcolor || colors[0],
    };
    newTokenNameDialogError = "";
    isTokenNamePromisePending = true;
    newTokenNameDialogOpenStore.set(true); // Open the dialog

    return new Promise<{ name: string; username: string; color: string } | null>((resolve) => {
      resolveNewTokenNamePromise = resolve;
    });
  }

  function handleSaveTokenName() {
    const trimmedName = newTokenFormData.name.trim();
    if (trimmedName === "") {
      newTokenNameDialogError = t("footer.nameEmpty", $translations);
      return; // Don't close dialog, don't resolve promise
    }
    newTokenNameDialogError = "";
    if (isTokenNamePromisePending) {
      // Only resolve if still pending
      resolveNewTokenNamePromise?.({
        name: trimmedName,
        username: newTokenFormData.username.trim(),
        color: newTokenFormData.color,
      });
      isTokenNamePromisePending = false;
    }
    newTokenNameDialogOpenStore.set(false); // Close dialog
  }

  function handleCancelTokenNameDialog() {
    if (isTokenNamePromisePending) {
      // Only resolve if still pending
      resolveNewTokenNamePromise?.(null);
      isTokenNamePromisePending = false;
    }
    newTokenNameDialogOpenStore.set(false); // Close dialog
  }
  // --- End New Token Name Dialog Logic ---

  // --- Delete Token Dialog Logic ---
  const deleteTokenDialogOpenStore = writable(false);
  let tokenToDelete: Token | null = null;

  const {
    elements: {
      overlay: deleteTokenDialogOverlay,
      content: deleteTokenDialogContent,
      title: deleteTokenDialogTitle,
      description: deleteTokenDialogDescription,
      close: deleteTokenDialogClose,
      portalled: deleteTokenDialogPortalled,
    },
    states: { open: deleteTokenDialogActualOpen },
  } = createDialog({
    open: deleteTokenDialogOpenStore,
    preventScroll: true,
  });

  function openDeleteTokenDialog(token: Token) {
    tokenToDelete = token;
    deleteTokenDialogOpenStore.set(true);
  }

  async function confirmDeleteToken() {
    if (!tokenToDelete) return;

    $settings.tokens = $settings.tokens.filter((t) => t.val !== tokenToDelete!.val);
    if ($settings.selected_token === tokenToDelete.val) {
      $settings.selected_token = null;
    }

    deleteTokenDialogOpenStore.set(false);
    tokenToDelete = null;
  }
  // --- End Delete Token Dialog Logic ---

  function selectToken(tokenVal: string | null) {
    clearFeedbacks();
    if (!tokenVal) return;
    $settings.selected_token = tokenVal;
    setupPopoverOpen = false;
  }

  async function triggerNewTokenProcess() {
    clearFeedbacks();
    const result = await promptForTokenNameWithDialog();

    if (result === null) {
      generalFeedback = t("footer.creationCancelled", $translations);
      setTimeout(() => (generalFeedback = ""), 2000);
      return;
    }

    const newToken: Token = {
      name: result.name,
      val: randstring(26),
      username: result.username,
      color: result.color,
    };
    $settings.tokens = [...$settings.tokens, newToken];
    $settings.selected_token = newToken.val;
    generalFeedback = t("footer.setupCreated", $translations).replace("{name}", newToken.name);
    setTimeout(() => (generalFeedback = ""), 2000);
  }

  async function importTokens() {
    clearFeedbacks();
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        importErrorFeedback = t("footer.clipboardEmpty", $translations);
        setTimeout(() => (importErrorFeedback = ""), 3000);
        return;
      }
      const imported = JSON.parse(text);
      if (Array.isArray(imported) && imported.every((t) => typeof t.name === "string" && typeof t.val === "string")) {
        const existingVals = new Set($settings.tokens.map((t) => t.val));
        const newTokens = imported.filter((t: Token) => !existingVals.has(t.val));

        $settings.tokens = [...$settings.tokens, ...newTokens];

        if (newTokens.length === 0 && imported.length > 0) {
          importErrorFeedback = t("footer.allExist", $translations);
        } else if (newTokens.length < imported.length) {
          importErrorFeedback = t("footer.importedSkipped", $translations).replace("{count}", String(newTokens.length));
        } else if (newTokens.length > 0) {
          generalFeedback = t("footer.imported", $translations).replace("{count}", String(newTokens.length));
        } else {
          importErrorFeedback = t("footer.nothingToImport", $translations);
        }

        if (newTokens.length > 0 && !$settings.selected_token) {
          $settings.selected_token = newTokens[0].val;
        }
      } else {
        importErrorFeedback = t("footer.invalidFormat", $translations);
      }
    } catch (error) {
      console.error("Failed to import setups:", error);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        importErrorFeedback = t("footer.clipboardDenied", $translations);
      } else if (error instanceof SyntaxError) {
        importErrorFeedback = t("footer.invalidJson", $translations);
      } else {
        importErrorFeedback = t("footer.clipboardReadFailed", $translations);
      }
    }
    setTimeout(() => {
      importErrorFeedback = "";
      generalFeedback = "";
    }, 3000);
  }

  async function exportTokens() {
    clearFeedbacks();
    if ($settings.tokens.length === 0) {
      generalFeedback = t("footer.nothingToExport", $translations);
      setTimeout(() => (generalFeedback = ""), 2000);
      return;
    }
    try {
      const tokensJson = JSON.stringify($settings.tokens, null, 2);
      await navigator.clipboard.writeText(tokensJson);
      copyExportFeedback = t("footer.exported", $translations);
    } catch (error) {
      console.error("Failed to export setups:", error);
      copyExportFeedback = t("footer.exportFailed", $translations);
      copyExportFailed = true;
    }
    setTimeout(() => (copyExportFeedback = ""), 2000);
  }
</script>

<footer class="mb-4 flex flex-col gap-2 mt-auto">
  <div class="flex flex-wrap justify-center gap-1">
    <Button size="sm" variant="ghost" href="https://git.coom.tech/coomdev/reaggie" class="gap-2">
      <Fa icon={faGitAlt} size="lg" />
      <span class="hidden sm:block">{t("footer.sourceCode", $translations)}</span>
    </Button>
    <Button size="sm" variant="ghost" href="/rules" class="gap-2">
      <Fa icon={faHandcuffs} size="lg" />
      <span class="hidden sm:block">{t("footer.rules", $translations)}</span>
    </Button>

    <Popover.Root bind:open={setupPopoverOpen} onOpenChange={() => !setupPopoverOpen && clearFeedbacks()}>
      <Popover.Trigger asChild let:builder>
        <Button builders={[builder]} size="sm" variant={buttonVariant} class="gap-2 min-w-[100px] justify-center">
          <Fa icon={buttonIcon} size="lg" />
          <span class="hidden sm:block truncate max-w-[120px]">{buttonText}</span>
          <span class="sm:hidden truncate max-w-[80px]">{buttonText}</span>
        </Button>
      </Popover.Trigger>
      <Popover.Content
        class="z-30 w-[280px] rounded-xl border bg-popover text-popover-foreground p-2 shadow-lg flex flex-col gap-1"
        transition={flyAndScale}
        sideOffset={8}>
        {#if $settings.tokens.length > 0}
          <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{t("footer.switchSetup", $translations)}</div>
          {#each $settings.tokens as token (token.val)}
            <div class="flex items-center gap-1 w-full group">
              <Button
                variant={$settings.selected_token === token.val ? "secondary" : "ghost"}
                size="sm"
                class="grow justify-start gap-2"
                on:click={() => selectToken(token.val)}>
                <Fa icon={$settings.selected_token === token.val ? faCheck : faAngleRight} class="w-4 h-4 text-muted-foreground" />
                <span class="truncate">{token.name}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                title={t("footer.deleteSetupTitle", $translations)}
                on:click={(e) => {
                  e.stopPropagation();
                  openDeleteTokenDialog(token);
                }}>
                <Fa icon={faTrash} class="w-3 h-3" />
              </Button>
            </div>
          {/each}

          {#if activeToken}
            <Button href="/account" variant="ghost" size="sm" class="w-full justify-start gap-2" on:click={() => (setupPopoverOpen = false)}>
              <Fa icon={faWrench} class="w-4 h-4 text-muted-foreground" />
              <span>{t("footer.manageSetup", $translations)}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="w-full justify-start gap-2 text-muted-foreground"
              on:click={() => {
                settings.update((s) => {
                  s.selected_token = null;
                  return s;
                });
                setupPopoverOpen = false;
              }}>
              <Fa icon={faAngleRight} class="w-4 h-4" />
              <span>{t("footer.deselect", $translations)}</span>
            </Button>
          {/if}
          <Separator class="my-1" />
        {/if}

        <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{t("footer.actions", $translations)}</div>
        <Button variant="ghost" size="sm" class="w-full justify-start gap-2" on:click={triggerNewTokenProcess}>
          <Fa icon={faPlus} class="w-4 h-4 text-muted-foreground" />
          <span>{t("footer.newSetupToken", $translations)}</span>
        </Button>

        {#if $settings.tokens.length === 0}
          <Button variant="ghost" size="sm" class="w-full justify-start gap-2" on:click={importTokens}>
            <Fa icon={faFileImport} class="w-4 h-4 text-muted-foreground" />
            <span>{t("footer.importSetups", $translations)}</span>
          </Button>
        {:else}
          <Button variant="ghost" size="sm" class="w-full justify-start gap-2" on:click={exportTokens}>
            <Fa icon={faFileExport} class="w-4 h-4 text-muted-foreground" />
            <span>{t("footer.exportSetups", $translations)}</span>
          </Button>
        {/if}

        {#if generalFeedback}
          <p class="p-1.5 text-xs text-center text-blue-600 dark:text-blue-400">{generalFeedback}</p>
        {/if}
        {#if copyExportFeedback}
          <p
            class="p-1.5 text-xs text-center"
            class:text-green-600={!copyExportFailed}
            class:dark:text-green-400={!copyExportFailed}
            class:text-red-600={copyExportFailed}
            class:dark:text-red-400={copyExportFailed}>
            {copyExportFeedback}
          </p>
        {/if}
        {#if importErrorFeedback}
          <p class="p-1.5 text-xs text-red-600 dark:text-red-400 text-center">{importErrorFeedback}</p>
        {/if}
      </Popover.Content>
    </Popover.Root>
    <Button size="sm" variant="ghost" href="mailto:jiggie-contact@proton.me" title="jiggie-contact@proton.me" class="gap-2">
      <Fa icon={faEnvelope} size="lg" />
      <span class="hidden sm:block">{t("footer.contact", $translations)}</span>
    </Button>
    {#await getStats() then s}
      <div use:aids={[`comics_${s?.last_comic_timestamp || 0}`, "shitter", "bingo", "discord"]}>
        <Popover.Root>
          <Popover.Trigger>
            <Button size="sm" variant="ghost" class="gap-2">
              <Fa icon={faPlusCircle} size="lg" />
              <span class="hidden sm:block">{t("footer.andMore", $translations)}</span>
            </Button>
          </Popover.Trigger>
          <Popover.Content
            class="z-30 max-w-[328px] rounded-[12px] border border-dark-10 bg-background p-2 shadow-popover flex-col flex"
            transition={flyAndScale}
            sideOffset={8}>
            <div id={`comics_${s?.last_comic_timestamp || 0}`} use:aids>
              <Button size="sm" variant="ghost" href="/lorecomics" title={t("lorecomics.title", $translations)} class="gap-2 justify-start">
                <Fa icon={faPalette} size="lg" />
                <span class="hidden sm:block">{t("footer.comics", $translations)}</span>
              </Button>
            </div>
            <div id="bingo" use:aids>
              <Button size="sm" variant="ghost" href="/bingo" title={t("bingo.title", $translations)} class="gap-2 justify-start">
                <Fa icon={faTable} size="lg" />
                <span class="hidden sm:block">{t("bingo.title", $translations)}</span>
              </Button>
            </div>
            <div id="shitter" use:aids>
              <Button size="sm" variant="ghost" href="https://x.com/jiggiefun" title="Twitter" target="_blank" class="gap-2 justify-start">
                <Fa icon={faXTwitter} size="lg" />
                <span class="hidden sm:block">Twitter</span>
              </Button>
            </div>
            <div id="discord" use:aids>
              <Button size="sm" variant="ghost" href="https://discord.gg/DyDcXWfaWc" title="Discord" target="_blank" class="gap-2 justify-start">
                <Fa icon={faDiscord} size="lg" />
                <span class="hidden sm:block">Discord</span>
              </Button>
            </div>
            {#if $deferredPrompt}
              <div id="install-app">
                <Button size="sm" variant="ghost" on:click={async () => {
                  if ($deferredPrompt) {
                    $deferredPrompt.prompt();
                    const { outcome } = await $deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                      deferredPrompt.set(null);
                    }
                  }
                }} title={t("footer.installApp", $translations)} class="gap-2 justify-start text-green-500 dark:text-green-400 hover:text-green-600 dark:hover:text-green-300">
                  <Fa icon={faDownload} size="lg" />
                  <span class="hidden sm:block font-semibold">{t("footer.installApp", $translations)}</span>
                </Button>
              </div>
            {/if}
          </Popover.Content>
        </Popover.Root>
      </div>
    {/await}

    <Button size="sm" variant="ghost" on:click={() => ($settings.direct = !$settings.direct)} class="gap-2">
      <Fa icon={faGlobe} size="lg" />
      <span title={t("footer.directHint", $translations)} class="hidden sm:block">{t("footer.directConnect", $translations).replace("{state}", $settings.direct ? t("footer.on", $translations) : t("footer.off", $translations))}</span>
    </Button>
  </div>

  <div class="flex justify-center items-center gap-2">
    {#await getStats()}
      {#each Array(3) as _}
        <Skeleton class="h-4 w-16" />
      {/each}
    {:then s}
      {#if s}
        <span class="text-xs">
          {t("footer.activeRooms", $translations).replace("{count}", String(s.active))}
        </span>
        <Separator orientation="vertical" class="h-4" />
        <span class="text-xs">
          {t("footer.playersCount", $translations).replace("{count}", String(s.unique_players || 0))}
        </span>
        <Separator orientation="vertical" class="h-4 hidden sm:block" />
        <span class="text-xs hidden sm:block">
          {t("footer.freeSpace", $translations).replace("{space}", String(s.freespace))}
        </span>
      {/if}
    {/await}
  </div>
</footer>

<div use:melt={$newTokenNameDialogPortalled}>
  {#if $newTokenNameDialogActualOpen}
    <div use:melt={$newTokenNameDialogOverlay} class="fixed inset-0 z-[51] bg-black/60 backdrop-blur-sm" />
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      use:melt={$newTokenNameDialogContent}
      class="fixed left-1/2 top-1/2 z-[52] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card p-6 shadow-xl"
      role="dialog"
      aria-labelledby="new-token-dialog-title"
      aria-describedby="new-token-dialog-description"
      on:keydown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault(); // Prevent other escape handlers if any
          handleCancelTokenNameDialog();
        }
      }}>
      <div class="flex items-center justify-between">
        <h2 use:melt={$newTokenNameDialogTitle} id="new-token-dialog-title" class="text-lg font-semibold text-card-foreground">
          {t("footer.newSetupTitle", $translations)}
        </h2>
        <button
          use:melt={$newTokenNameDialogClose}
          on:click={handleCancelTokenNameDialog}
          aria-label={t("footer.closeDialog", $translations)}
          class="text-muted-foreground hover:text-accent-foreground p-1 rounded-full">
          <Fa icon={faTimes} class="h-4 w-4" />
        </button>
      </div>
      <p id="new-token-dialog-description" class="mt-1 text-sm text-muted-foreground">{t("footer.newSetupDescription", $translations)}</p>

      <div class="mt-4 flex flex-col gap-4">
        <div class="grid w-full items-center gap-1.5">
          <Label for="setup-name">{t("footer.setupName", $translations)}</Label>
          <Input
            id="setup-name"
            type="text"
            bind:value={newTokenFormData.name}
            placeholder={t("footer.setupNamePlaceholder", $translations)}
            on:keydown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSaveTokenName();
              }
            }}
            class={newTokenNameDialogError ? "border-destructive" : ""} />
        </div>

        <div class="grid w-full items-center gap-1.5">
          <Label for="username">{t("footer.userName", $translations)}</Label>
          <Input
            id="username"
            type="text"
            bind:value={newTokenFormData.username}
            placeholder={t("footer.aliasPlaceholder", $translations)}
            on:keydown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSaveTokenName();
              }
            }} />
        </div>

        <div class="grid w-full items-center gap-1.5">
          <Label class="w-auto">{t("footer.color", $translations)}</Label>
          <ColorPickerSelector {colors} bind:value={newTokenFormData.color} />
        </div>
      </div>

      {#if newTokenNameDialogError}
        <p id="new-token-name-error" class="mt-1.5 text-xs text-destructive">{newTokenNameDialogError}</p>
      {/if}

      <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-3 gap-2">
        <Button variant="outline" on:click={handleCancelTokenNameDialog} class="w-full sm:w-auto">{t("footer.cancel", $translations)}</Button>
        <Button on:click={handleSaveTokenName} class="w-full sm:w-auto">{t("footer.saveSetup", $translations)}</Button>
      </div>
    </div>
  {/if}
</div>

<div use:melt={$deleteTokenDialogPortalled}>
  {#if $deleteTokenDialogActualOpen}
    <div use:melt={$deleteTokenDialogOverlay} class="fixed inset-0 z-[51] bg-black/60 backdrop-blur-sm" />
    <div
      use:melt={$deleteTokenDialogContent}
      class="fixed left-1/2 top-1/2 z-[52] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card p-6 shadow-xl"
      role="dialog"
      aria-labelledby="delete-token-dialog-title"
      aria-describedby="delete-token-dialog-description">
      <div class="flex items-center justify-between gap-4">
        <h2 use:melt={$deleteTokenDialogTitle} id="delete-token-dialog-title" class="text-lg font-semibold text-destructive">{t("footer.deleteSetupQuestion", $translations)}</h2>
        <button
          use:melt={$deleteTokenDialogClose}
          aria-label={t("footer.closeDialog", $translations)}
          class="text-muted-foreground hover:text-accent-foreground p-1 rounded-full">
          <Fa icon={faTimes} class="h-4 w-4" />
        </button>
      </div>

      <div id="delete-token-dialog-description" class="mt-4 text-sm text-muted-foreground space-y-3">
        <p>
          {t("footer.deleteConfirm", $translations).split("{name}")[0]}<span class="font-bold text-foreground">{tokenToDelete?.name}</span>{t("footer.deleteConfirm", $translations).split("{name}")[1] ?? ""}
        </p>
        <div class="bg-muted/50 p-2 rounded-md border border-border/50 break-all font-mono text-xs select-all">
          {JSON.stringify([tokenToDelete])}
        </div>
        <p class="text-yellow-600 dark:text-yellow-400 font-medium text-xs">{t("footer.keepCode", $translations)}</p>
      </div>

      <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-3 gap-2">
        <Button variant="outline" on:click={() => deleteTokenDialogOpenStore.set(false)} class="w-full sm:w-auto">{t("footer.cancel", $translations)}</Button>
        <Button variant="destructive" on:click={confirmDeleteToken} class="w-full sm:w-auto">{t("footer.deleteSetup", $translations)}</Button>
      </div>
    </div>
  {/if}
</div>
