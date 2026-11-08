<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Separator } from "$lib/components/ui/separator";
  import { toast } from "svelte-sonner";
  import { page } from "$app/stores";
  import Fa from "svelte-fa";
  import { faCheck, faEdit, faSave, faTimes, faUpload, faImage, faRedo } from "@fortawesome/free-solid-svg-icons";

  // Types
  interface BingoCell {
    id: string; // Assumed ID is present for patching
    condition: string;
    checked: boolean;
  }

  interface BingoData {
    token: string;
    editable: boolean;
    grid: BingoCell[];
  }

  interface Condition {
    id: string;
    desc: string;
  }

  // State
  let loading = true;
  let error: string | null = null;
  let bingoData: BingoData | null = null;
  let editMode = false;
  let availableConditions: Condition[] = [];
  let conditionsLoading = false;

  // Selection for editing
  let selectedCellIndex: number | null = null;

  // Image Upload & Cropping
  let fileInput: HTMLInputElement;
  let selectedFile: File | null = null;
  let previewImageSrc: string | null = null;
  let cropCanvas: HTMLCanvasElement;
  let cropImage: HTMLImageElement;
  let cropState = { x: 0, y: 0, scale: 1 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let uploading = false;
  let uploadType: "avatar" | "banner" = "avatar";


  const TOKEN_STORAGE_KEY = "bingo_token";

  onMount(async () => {
    const urlToken = $page.url.searchParams.get("token");
    let tokenToUse = urlToken || localStorage.getItem(TOKEN_STORAGE_KEY) || undefined;

    await fetchBingo(tokenToUse);
  });

  async function fetchBingo(token?: string) {
    loading = true;
    error = null;
    try {
      /*
      bingoData = {
        editable: true,
        token: "abc",
        grid: [...new Array(25)].map((e) => ({
          checked: Math.random() > 0.5,
          condition: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
          id: "" + Math.random(),
        })),
      };
      return;
      */
      const url = new URL("/api/bingo", window.location.origin);
      if (typeof token === "string" && token) url.searchParams.set("token", token);

      const res = await fetch(url);
      if (!res.ok) throw new Error(t("bingo.failedLoad", $translations));

      const data = await res.json();
      bingoData = data;

      // Cache token if we got one and it wasn't from URL (or even if it was)
      if (data.token && typeof data.token === "string") {
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function toggleEditMode() {
    if (editMode) {
      editMode = false;
      selectedCellIndex = null;
      return;
    }

    if (conditionsLoading) return;
    conditionsLoading = true;
    try {
      // availableConditions = [...new Array(25)].map((e) => ({
      //   desc: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
      //   id: "" + Math.random(),
      // }));
      const res = await fetch("/api/bingoconds");
      if (!res.ok) throw new Error(t("bingo.failedConditions", $translations));
      availableConditions = await res.json();
      editMode = true;
    } catch (e: any) {
      toast.error(t("bingo.conditionsError", $translations) + e.message);
    } finally {
      conditionsLoading = false;
    }
  }

  function selectCell(index: number) {
    if (!editMode) return;
    selectedCellIndex = index;
  }

  function updateCell(condition: Condition | null) {
    if (bingoData && selectedCellIndex !== null) {
      if (condition) {
        bingoData.grid[selectedCellIndex] = {
          id: condition.id,
          condition: condition.desc,
          checked: false, // Reset checked status when changing
        };
      } else {
        // Clear cell
        bingoData.grid[selectedCellIndex] = {
          id: "",
          condition: "Empty",
          checked: false,
        };
      }
      bingoData = bingoData; // Trigger reactivity
      selectedCellIndex = null;
    }
  }



  async function saveGrid() {
    if (!bingoData) return;

    // Validate that all cells are filled
    if (bingoData.grid.some((c) => !c.id)) {
      toast.error(t("bingo.fillAll", $translations));
      return;
    }

    const gridIds = bingoData.grid.map((c) => c.id);

    try {
      const res = await fetch("/api/bingo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: bingoData.token,
          grid_ids: gridIds,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("bingo.failedSave", $translations));
      }

      toast.success(t("bingo.saved", $translations));
      editMode = false;
      // Refresh to be safe/sync
      await fetchBingo(bingoData.token);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // --- Logic for Validity (Row/Col/Diag) & Winning Lines ---

  interface WinningLine {
    type: "row" | "col" | "diag1" | "diag2"; // diag1: top-left to bottom-right, diag2: top-right to bottom-left
    index: number; // 0-4 for row/col, 0 for diags
  }

  $: winningLines = (() => {
    const lines: WinningLine[] = [];
    if (!bingoData) return lines;
    const g = bingoData.grid;
    if (g.length !== 25) return lines;

    const isChecked = (i: number) => g[i]?.checked;

    // Rows
    for (let r = 0; r < 5; r++) {
      if (isChecked(r * 5) && isChecked(r * 5 + 1) && isChecked(r * 5 + 2) && isChecked(r * 5 + 3) && isChecked(r * 5 + 4)) {
        lines.push({ type: "row", index: r });
      }
    }
    // Cols
    for (let c = 0; c < 5; c++) {
      if (isChecked(c) && isChecked(c + 5) && isChecked(c + 10) && isChecked(c + 15) && isChecked(c + 20)) {
        lines.push({ type: "col", index: c });
      }
    }
    // Diagonals
    if (isChecked(0) && isChecked(6) && isChecked(12) && isChecked(18) && isChecked(24)) {
      lines.push({ type: "diag1", index: 0 });
    }
    if (isChecked(4) && isChecked(8) && isChecked(12) && isChecked(16) && isChecked(20)) {
      lines.push({ type: "diag2", index: 0 });
    }

    return lines;
  })();

  // Create a Set of winning cell indices for highlighting
  $: winningIndices = (() => {
    const indices = new Set<number>();
    for (const line of winningLines) {
      if (line.type === "row") {
        for (let i = 0; i < 5; i++) indices.add(line.index * 5 + i);
      } else if (line.type === "col") {
        for (let i = 0; i < 5; i++) indices.add(i * 5 + line.index);
      } else if (line.type === "diag1") {
        [0, 6, 12, 18, 24].forEach((i) => indices.add(i));
      } else if (line.type === "diag2") {
        [4, 8, 12, 16, 20].forEach((i) => indices.add(i));
      }
    }
    return indices;
  })();

  // Filter available conditions to exclude those already in the grid
  $: usedConditionIds = new Set((bingoData?.grid || []).map((c) => c.id).filter((id) => id !== "" && id != null));
  $: filteredConditions = availableConditions.filter((c) => !usedConditionIds.has(c.id));

  // --- Image Upload & Cropping ---
  function onFileSelected(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      handleFile(target.files[0]);
    }
    target.value = "";
  }

  let isDragOver = false;
  function onDrop(e: DragEvent) {
    isDragOver = false;
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }

  function handleFile(file: File) {
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        previewImageSrc = ev.target.result as string;
        resetCropState();
      }
    };
    reader.readAsDataURL(selectedFile);
  }

  function resetCropState() {
    cropState = { x: 0, y: 0, scale: 1 };
  }

  function onCropMouseDown(e: MouseEvent) {
    isDragging = true;
    dragStart = { x: e.clientX - cropState.x, y: e.clientY - cropState.y };
  }
  function onCropMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    cropState.x = e.clientX - dragStart.x;
    cropState.y = e.clientY - dragStart.y;
    cropState = cropState; // reactivity
  }
  function onCropMouseUp() {
    isDragging = false;
  }
  function onCropWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomSpeed = 0.001;
    const newScale = cropState.scale - e.deltaY * zoomSpeed;
    cropState.scale = Math.max(0.1, Math.min(newScale, 10));
  }

  async function uploadReward() {
    if (!bingoData || winningLines.length === 0) return;
    if (!previewImageSrc || !cropImage) return;

    uploading = true;
    try {
      // 1. Render to canvas
      const isBanner = uploadType === "banner";
      const width = isBanner ? 490 : 256;
      const height = isBanner ? 144 : 256;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      ctx.translate(cropState.x, cropState.y);
      ctx.scale(cropState.scale, cropState.scale);
      ctx.drawImage(cropImage, 0, 0);

      // Get Blob
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to create image blob");

      const formData = new FormData();
      formData.append("token", bingoData.token);
      formData.append("file", blob, isBanner ? "banner.png" : "reward.png");

      const endpoint = isBanner ? "/api/bingobanner" : "/api/bingoimg";
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      toast.success("Reward uploaded successfully!");
      previewImageSrc = null; // Close modal
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      uploading = false;
    }
  }

  // Bug fix: ensure fileInput is available even if not re-rendered
  // We'll place it outside the if block
</script>

<div class="container mx-auto p-4 max-w-4xl min-h-screen flex flex-col gap-6">
  <!-- Header -->
  <div class="flex flex-col md:flex-row justify-between items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
    <div class="space-y-1 text-center md:text-left">
      <h1 class="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">{t("bingo.title", $translations)}</h1>
      <p class="text-muted-foreground">{t("bingo.subtitle", $translations)}</p>
    </div>

    {#if bingoData}
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" on:click={() => fetchBingo(bingoData?.token)} title={t("bingo.refresh", $translations)}>
          <Fa icon={faRedo} />
        </Button>
      </div>
    {/if}
  </div>

  <Separator />

  <!-- Main Content -->
  {#if loading}
    <div class="grid grid-cols-5 gap-2 md:gap-4">
      {#each Array(25) as _}
        <Skeleton class="aspect-square w-full rounded-xl" />
      {/each}
    </div>
  {:else if error}
    <Card class="border-destructive/50 bg-destructive/10">
      <CardHeader>
        <CardTitle class="text-destructive">{t("bingo.errorTitle", $translations)}</CardTitle>
        <CardDescription>{error}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" on:click={() => fetchBingo()}>{t("bingo.tryAgain", $translations)}</Button>
      </CardContent>
    </Card>
  {:else if bingoData}
    <div class="flex flex-col gap-6">
      <!-- Token Display -->
      <Card class="bg-card/50 border-muted">
        <CardHeader>
          <CardTitle class="text-lg">{t("bingo.tokenTitle", $translations)}</CardTitle>
          <CardDescription class="text-yellow-500 font-medium">{t("bingo.tokenImportant", $translations)}</CardDescription>
        </CardHeader>
        <CardContent>
          <p class="text-sm text-muted-foreground mb-2">{t("bingo.tokenHelp", $translations)}</p>
          <div class="flex gap-2">
            <Input
              bind:value={bingoData.token}
              class="font-mono bg-background"
              on:change={() => fetchBingo(bingoData?.token)}
              placeholder={t("bingo.tokenPlaceholder", $translations)} />
            <Button on:click={() => fetchBingo(bingoData?.token)}>{t("bingo.load", $translations)}</Button>
          </div>
        </CardContent>
      </Card>

      <!-- Grid -->
      <div class="relative">
        <div class="grid grid-cols-5 gap-2 md:gap-4 relative z-10">
          {#each bingoData.grid as cell, i}
            <button
              class="
                   aspect-square rounded-lg border-2 p-1 md:p-2 flex items-center justify-center text-center text-[10px] md:text-xs leading-tight transition-all relative overflow-hidden group
                   {editMode ? 'hover:border-primary cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'}
                   {winningIndices.has(i)
                ? 'bg-green-500/30 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                : cell.checked
                  ? 'bg-primary/20 border-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]'
                  : 'bg-card border-border hover:bg-accent/50'}
                 {!cell.id ? 'border-dashed border-muted-foreground/50 opacity-70' : ''}
                 "
              on:click={() => selectCell(i)}
              disabled={!editMode}>
              <span class="z-10 font-medium select-none">{cell.condition}</span>

              {#if cell.checked}
                <div class="absolute top-1 right-1 opacity-50 {winningIndices.has(i) ? 'text-green-400' : 'text-primary'}">
                  <Fa icon={faCheck} size="xs" />
                </div>
              {/if}

              <!-- Edit Overlay Indicator -->
              {#if editMode}
                <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                  <Fa icon={faEdit} class="text-primary opacity-20" size="2x" />
                </div>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- Reward Section -->
      {#if winningLines.length > 0}
        <Card class="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20 box-border overflow-hidden relative">
          <div class="inset-0 bg-grid-white/5 mask-image-gradient-b"></div>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-green-500">
              <Fa icon={faCheck} /> Bingo Completed!
            </CardTitle>
            <CardDescription>{t("bingo.lineComplete", $translations)}</CardDescription>
          </CardHeader>
          <CardContent class="flex flex-col md:flex-row gap-4">
            <div class="flex-1 space-y-2">
              <h3 class="font-semibold text-sm">{t("bingo.rewardIcon", $translations)}</h3>
              <p class="text-xs text-muted-foreground">{t("bingo.uploadIconHelp", $translations)}</p>
              <Button
                variant="outline"
                class="w-full h-24 border-dashed"
                on:click={() => {
                  uploadType = "avatar";
                  fileInput.click();
                }}>
                <div class="flex flex-col items-center gap-1">
                  <Fa icon={faUpload} />
                  <span>{t("bingo.uploadIcon", $translations)}</span>
                </div>
              </Button>
            </div>

            <div class="flex-1 space-y-2">
              <h3 class="font-semibold text-sm">{t("bingo.profileBanner", $translations)}</h3>
              <p class="text-xs text-muted-foreground">{t("bingo.uploadBannerHelp", $translations)}</p>
              <Button
                variant="outline"
                class="w-full h-24 border-dashed"
                on:click={() => {
                  uploadType = "banner";
                  fileInput.click();
                }}>
                <div class="flex flex-col items-center gap-1">
                  <Fa icon={faImage} />
                  <span>{t("bingo.uploadBanner", $translations)}</span>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      {/if}
    </div>
  {/if}

  <input type="file" accept="image/png, image/jpeg" class="hidden" bind:this={fileInput} on:change={onFileSelected} />

  <!-- Condition Selector Modal (Pop-up) -->
  {#if selectedCellIndex !== null && editMode}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      on:click|self={() => (selectedCellIndex = null)}
      on:keydown|self={(e) => e.key === "Escape" && (selectedCellIndex = null)}
      role="button"
      tabindex="0">
      <Card class="w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        <CardHeader>
          <CardTitle>{t("bingo.selectCondition", $translations)}</CardTitle>
          <CardDescription>{t("bingo.chooseMission", $translations)}</CardDescription>
        </CardHeader>
        <CardContent class="overflow-y-auto p-2">


          <Button variant="destructive" class="w-full mb-2" on:click={() => updateCell(null)}>
            <Fa icon={faTimes} class="mr-2" /> Clear Cell
          </Button>
          <div class="grid grid-cols-1 gap-1">
            {#each filteredConditions as cond}
              <button class="flex items-start p-3 rounded-lg hover:bg-accent text-left text-sm transition-colors" on:click={() => updateCell(cond)}>
                {cond.desc}
              </button>
            {/each}
            {#if filteredConditions.length === 0}
              <div class="text-center p-4 text-muted-foreground text-sm">{t("bingo.noConditions", $translations)}</div>
            {/if}
          </div>
        </CardContent>
        <div class="p-4 border-t flex justify-end">
          <Button variant="ghost" on:click={() => (selectedCellIndex = null)}>{t("bingo.cancel", $translations)}</Button>
        </div>
      </Card>
    </div>
  {/if}

  <!-- Crop Modal -->
  {#if previewImageSrc}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div class="flex flex-col gap-4 w-full max-w-md">
        <div class="flex justify-between items-center text-white">
          <h2 class="text-xl font-bold">{t("bingo.adjustImage", $translations)}</h2>
          <Button
            variant="ghost"
            size="icon"
            on:click={() => {
              previewImageSrc = null;
              fileInput.value = "";
            }}>
            <Fa icon={faTimes} />
          </Button>
        </div>

        <!-- Crop Area -->
        <div
          class="relative bg-black/50 aspect-square w-full rounded-xl overflow-hidden border border-white/20 shadow-2xl cursor-move touch-none select-none flex items-center justify-center"
          role="button"
          tabindex="0"
          aria-label="Crop Image"
          on:mousedown={onCropMouseDown}
          on:mousemove={onCropMouseMove}
          on:mouseup={onCropMouseUp}
          on:mouseleave={onCropMouseUp}
          on:wheel={onCropWheel}>
          <!-- Helper/Instruction -->
          <div class="inset-0 z-0 pointer-events-none flex items-center justify-center">
            <span class="text-white/20 text-sm font-bold uppercase tracking-widest">
              {uploadType === "banner" ? "490 x 144" : "256 x 256"}
            </span>
          </div>

          <!-- The Image -->
          <!-- We simply use CSS transform to represent the state -->
          <div
            class="relative overflow-hidden ring-2 ring-primary bg-zinc-900 pointer-events-none"
            style="width: {uploadType === 'banner' ? 490 : 256}px; height: {uploadType === 'banner' ? 144 : 256}px;">
            <img
              bind:this={cropImage}
              src={previewImageSrc}
              alt="Crop Preview"
              class="max-w-none absolute origin-top-left"
              style="transform: translate({cropState.x}px, {cropState.y}px) scale({cropState.scale});"
              draggable="false" />
          </div>

          <p class="absolute bottom-4 text-xs text-white/50 pointer-events-none">{t("bingo.dragZoom", $translations)}</p>
        </div>

        <div class="flex gap-2 justify-end">
          <Button
            variant="outline"
            on:click={() => {
              previewImageSrc = null;
              fileInput.value = "";
            }}>{t("bingo.cancel", $translations)}</Button>
          <Button on:click={uploadReward} disabled={uploading}>
            {#if uploading}
              Uploading...
            {:else}
              <Fa icon={faCheck} class="mr-2" /> Confirm
            {/if}
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Optional: Custom scrollbar for the condition list */
</style>
