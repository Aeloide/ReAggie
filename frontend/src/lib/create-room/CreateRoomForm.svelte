<script lang="ts">
  import { t, translations } from "$lib/i18n";
  import { goto } from "$app/navigation";
  import * as Accordion from "$lib/components/ui/accordion";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Progress } from "$lib/components/ui/progress";
  import Separator from "$lib/components/ui/separator/separator.svelte";
  import * as Tabs from "$lib/components/ui/tabs";
  import { faGamepad } from "@fortawesome/free-solid-svg-icons/faGamepad";
  import { faGear } from "@fortawesome/free-solid-svg-icons/faGear";
  import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
  import Fa from "svelte-fa";
  import { toast } from "svelte-sonner";
  import { fly } from "svelte/transition";
  import Checkbox from "./Checkbox.svelte";
  import MediaSelector from "./MediaSelector.svelte";
  import PiecesCount from "./PiecesCount.svelte";
  import RoomTagSelector from "./RoomTagSelector.svelte";
  import PieceLayoutStudio from "./PieceLayoutStudio.svelte";
  import { createRoom } from "./apiService";
  import roomSettings from "./roomSettingsStore";
  import { layoutStore } from "./layoutStore";
  import { generateSets } from "./utils";
  import { defaultVoronoiSites, defaultDistributors } from "./distributorsPresets";
  import { tesselateSurface } from "./voronoi";
  import { settings } from "$lib/room/stores";
  import { generateAndPackLayouts } from "./layoutGenerator";
  import { generateThumbnail } from "./thumbnail-generator";
  import type { CreateRoomSubmitParams, MediaItem, PiecesEstimation } from "./types";
  import { aids } from "../../utils";
  import { isMp4Hevc } from "./hevc";
  import { isPWA } from "$lib/pwaStore";
  import { saveOfflineRoom } from "$lib/offline/db";
  import { cn } from "$lib/utils";

  const CHARSET = "0123456789abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randstring = (n: number) => [...new Array(n)].map(() => CHARSET[~~(Math.random() * CHARSET.length)]).join("");

  let mediaItems: MediaItem[] = [];
  let isLoading = false;
  let progress: number | undefined;
  let status: string;
  let review: string = '';
  let piecesEstimation: PiecesEstimation | undefined;
  let params: CreateRoomSubmitParams = {
    name: "",
    urlname: "",
    censor: "",
    size: "",
  };

  let layoutStudio: PieceLayoutStudio;

  // allow pressing the "Create Room" button even if no media is selected
  // it will show a native error message
  $: canCreateRoom = !piecesEstimation || piecesEstimation.valid;

  function autoSeparateEdgesForLayout(imageId: string, cols: number, rows: number) {
    const layout = $layoutStore.get(imageId);
    if (!layout) return;

    let hasEdgesBag = false;
    for (const b of layout.bags.values()) {
      if (b.name === "Edge pieces") {
        hasEdgesBag = true;
        break;
      }
    }
    if (hasEdgesBag) return;

    const edges = new Set<number>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
          edges.add(r * cols + c);
        }
      }
    }

    if (edges.size === 0) return;

    const defaultBagId = 0;
    const defaultBag = layout.bags.get(defaultBagId);
    if (!defaultBag) return;

    for (const p of edges) {
      defaultBag.pieces.delete(p);
    }

    const newBagId = 1;
    layout.bags.set(newBagId, {
      id: newBagId,
      name: "Edge pieces",
      color: "#f44336",
      pieces: edges,
      presolved: false,
      distributorType: "disk",
      distributorCode: defaultDistributors.disk.code,
      connectedToRegion: defaultBag.distributorType === "clearRect" ? {
        parentImageId: imageId,
        parentBagId: defaultBagId,
        regionName: "center"
      } : undefined
    });

    layoutStore.update(m => {
      m.set(imageId, { ...layout, bags: new Map(layout.bags) });
      return m;
    });
  }

  async function debugLayout(e: MouseEvent) {
    e.preventDefault();

    isLoading = true;
    status = t("createRoom.uploading", $translations);

    if ($roomSettings.listable) {
      const thumbnail = await generateThumbnail(mediaItems[0], {
        width: 240,
        height: 240,
        blur: $roomSettings.preview,
        maintainAspectRatio: true,
      });

      params.thumbnail = thumbnail?.blob;
    }

    // Pre-calculate positions on the client using the customizable distributor
    const dims = mediaItems.map((e) => [e.width, e.height]) as [number, number][];
    const sets = generateSets($roomSettings.pieces, mediaItems.length, dims);

    for (let sid = 0; sid < sets.length; sid++) {
      const set = sets[sid];
      const imageId = mediaItems[sid].item.objectUrl || sid.toString();
      let targetPieces = $roomSettings.voronoi ? Math.round($roomSettings.pieces / (mediaItems.length || 1)) : set.cols * set.rows;

      let existingLayout = $layoutStore.get(imageId);
      if (!existingLayout) {
        layoutStore.initImage(imageId, targetPieces);
        existingLayout = $layoutStore.get(imageId);
      }

      if ($roomSettings.edges) {
        autoSeparateEdgesForLayout(imageId, set.cols, set.rows);
        existingLayout = $layoutStore.get(imageId);
      }

      if ($roomSettings.voronoi) {
        // Run client-side tessellation to get the actual number of sites/pieces
        try {
          let sites = $layoutStore.get(imageId)?.voronoiConfig?.sites;
          if (!sites) { 
            const fnStr = $roomSettings.voronoiCode || defaultVoronoiSites.random.code;
            const fn = new Function("width", "height", "count", fnStr + "\n return generateSites(width, height, count);");
            sites = fn(set.imageWidth, set.imageHeight, targetPieces);
          }
          if (sites && sites.length >= 3) {
            const seed = ~~(0xffff * Math.random());
            const tessellation = tesselateSurface(set.imageWidth, set.imageHeight, targetPieces, seed, sites);
            targetPieces = tessellation.length;
            const edges = tessellation
              .map((t, idx) => (t.segments.some((s) => s.neighborIndex === undefined) ? idx : -1))
              .filter((idx) => idx !== -1);

            // Inject voronoiConfig into the layout store
            layoutStore.update((m) => {
              const l = m.get(imageId);
              if (l) {
                l.voronoiConfig = {
                  total: tessellation.length,
                  edges,
                  seed,
                  sites: tessellation.map((t) => t.site),
                };
              }
              return new Map(m);
            });
            existingLayout = $layoutStore.get(imageId);
          }
        } catch (e) {
          console.error("Error computing Voronoi sites on submit:", e);
        }
      }

      let storePieces = 0;
      if (existingLayout) {
        for (const bag of existingLayout.bags.values()) {
          storePieces += bag.pieces.size;
        }
      }

      if (storePieces !== targetPieces) {
        layoutStore.setPieceCount(imageId, targetPieces);
      }
    }

    const { orderedLayouts } = generateAndPackLayouts(mediaItems, $layoutStore, {
      pieces: $roomSettings.pieces,
      distributorCode: $roomSettings.distributorCode,
      distributorPreset: $roomSettings.distributorPreset,
      mixsets: $roomSettings.mixsets,
      rotation: $roomSettings.rotation,
    });

    // Sync positions back to the store so component states match the serialized positions
    for (const layout of orderedLayouts) {
      const storeLayout = $layoutStore.get(layout.imageId);
      if (storeLayout) {
        storeLayout.positions = layout.positions;
      }
    }

    $roomSettings.token = $settings.selected_token || undefined;
    params.layouts = orderedLayouts;

    console.log("Debug Layout Payload:", { params, mediaItems, layouts: orderedLayouts });
    isLoading = false;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    isLoading = true;
    status = t("createRoom.uploading", $translations);

    try {
    if ($roomSettings.listable) {
      const thumbnail = await generateThumbnail(mediaItems[0], {
        width: 240,
        height: 240,
        blur: $roomSettings.preview,
        maintainAspectRatio: true,
      });

      params.thumbnail = thumbnail?.blob;
    }

    // Pre-calculate positions on the client using the customizable distributor
    const dims = mediaItems.map((e) => [e.width, e.height]) as [number, number][];
    const sets = generateSets($roomSettings.pieces, mediaItems.length, dims);

    for (let sid = 0; sid < sets.length; sid++) {
      const set = sets[sid];
      const imageId = mediaItems[sid].item.objectUrl || sid.toString();
      let targetPieces = $roomSettings.voronoi ? Math.round($roomSettings.pieces / (mediaItems.length || 1)) : set.cols * set.rows;

      let existingLayout = $layoutStore.get(imageId);
      if (!existingLayout) {
        layoutStore.initImage(imageId, targetPieces);
        existingLayout = $layoutStore.get(imageId);
      }

      if ($roomSettings.edges) {
        autoSeparateEdgesForLayout(imageId, set.cols, set.rows);
        existingLayout = $layoutStore.get(imageId);
      }

      if ($roomSettings.voronoi) {
        // Run client-side tessellation to get the actual number of sites/pieces
        try {
          let sites = $layoutStore.get(imageId)?.voronoiConfig?.sites;
          if (!sites) { 
            const fnStr = $roomSettings.voronoiCode || defaultVoronoiSites.random.code;
            const fn = new Function("width", "height", "count", fnStr + "\n return generateSites(width, height, count);");
            sites = fn(set.imageWidth, set.imageHeight, targetPieces);
          }
          if (sites && sites.length >= 3) {
            const seed = ~~(0xffff * Math.random());
            const tessellation = tesselateSurface(set.imageWidth, set.imageHeight, targetPieces, seed, sites);
            targetPieces = tessellation.length;
            const edges = tessellation
              .map((t, idx) => (t.segments.some((s) => s.neighborIndex === undefined) ? idx : -1))
              .filter((idx) => idx !== -1);

            // Inject voronoiConfig into the layout store
            layoutStore.update((m) => {
              const l = m.get(imageId);
              if (l) {
                l.voronoiConfig = {
                  total: tessellation.length,
                  edges,
                  seed,
                  sites: tessellation.map((t) => t.site),
                };
              }
              return new Map(m);
            });
            existingLayout = $layoutStore.get(imageId);
          }
        } catch (e) {
          console.error("Error computing Voronoi sites on submit:", e);
        }
      }

      let storePieces = 0;
      if (existingLayout) {
        for (const bag of existingLayout.bags.values()) {
          storePieces += bag.pieces.size;
        }
      }

      if (storePieces !== targetPieces) {
        layoutStore.setPieceCount(imageId, targetPieces);
      }
    }

    const { orderedLayouts } = generateAndPackLayouts(mediaItems, $layoutStore, {
      pieces: $roomSettings.pieces,
      distributorCode: $roomSettings.distributorCode,
      distributorPreset: $roomSettings.distributorPreset,
      mixsets: $roomSettings.mixsets,
      rotation: $roomSettings.rotation,
    });

    // Sync positions back to the store so component states match the serialized positions
    for (const layout of orderedLayouts) {
      const storeLayout = $layoutStore.get(layout.imageId);
      if (storeLayout) {
        storeLayout.positions = layout.positions;
      }
    }

    $roomSettings.token = $settings.selected_token || undefined;
    params.layouts = orderedLayouts;

    if (roomType === "offline") {
      if (!params.files || params.files.length === 0) {
        showError(t("createRoom.selectImage", $translations));
        isLoading = false;
        return;
      }
      const id = randstring(12);
      try {
        await saveOfflineRoom({
          id,
          name: params.name || t("createRoom.offlinePuzzle", $translations),
          pieces: $roomSettings.pieces,
          created_at: new Date(),
          imageBlob: params.files[0],
          imageWidth: mediaItems[0].width,
          imageHeight: mediaItems[0].height,
          imageName: params.files[0].name,
          media: mediaItems.map((media, index) => ({
            blob: params.files![index],
            width: media.width,
            height: media.height,
            name: params.files![index].name
          })),
          layouts: orderedLayouts,
          roomSettings: { ...$roomSettings },
        });
        layoutStore.set(new Map());
        goto(`/offline/${id}`);
        return;
      } catch (err: any) {
        showError(t("createRoom.failedSave", $translations).replace("{error}", err.message));
        isLoading = false;
        return;
      }
    }

    const { room, error } = await createRoom(params, $roomSettings, (n) => {
      progress = n;
      if (n >= 1) status = t("createRoom.generating", $translations);
    }, ss => {
      review = ss;
    });
    if (room) {
      settings.init(room.id, room.secret);
      layoutStore.set(new Map());
      goto(`/${room.id}`);
      return;
    }

    showError(t("createRoom.failedCreate", $translations).replace("{error}", String(error)));
    isLoading = false;
    } catch (error) {
      console.error("Failed to prepare room layout", error);
      showError(error instanceof Error ? error.message : t("createRoom.failedPrepare", $translations));
      isLoading = false;
    }
  }

  function onImageSelectorError(event: CustomEvent<{ text: string }>) {
    showError(event.detail.text);
  }

  function onImageSelectorMediaLoad(event: CustomEvent<MediaItem[]>) {
    mediaItems = event.detail;
    params.size = mediaItems.map((x) => `${x.width},${x.height}`).join(";");
  }

  const showError = (message: string) => {
    toast.error(message, { duration: 8_000 });
  };

  function updateFlip() {
    if (mediaItems.length % 2 != 0) return t("createRoom.evenImages", $translations);
    for (let i = 0; i < mediaItems.length; i += 2) {
      const a = mediaItems[i];
      const b = mediaItems[i + 1];
      if (a.width != b.width || a.height != b.height) return t("createRoom.sameResolution", $translations);
    }
  }

  let roomType = $isPWA ? "offline" : $roomSettings.listable ? "public" : "private";
  $: if ($isPWA) {
    roomType = "offline";
    $roomSettings.listable = false;
  }
  let flipError: string | undefined = undefined;
  let otherError: string | undefined = undefined;

  async function doHEVCCheck() {
    let hasHEVC = false;

    for (let m of params.files || []) {
      if (m.name.endsWith(".mp4") && (await isMp4Hevc(m))) {
        hasHEVC = true;
        break;
      }
    }

    if (hasHEVC)
      otherError = t("createRoom.hevcWarning", $translations);
  }

  let total = 0;
  let totalb = 0;
  function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024; // Use 1000 for SI units (KB, MB, etc.) or 1024 for binary units (KiB, MiB, etc.)
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  // doesn't take into account the data used to store group properties and stuff.
  function doRAMUsageEst() {
    total = 0;
    for (let m of mediaItems) {
      total += m.width * m.height * 4; //RGBA8 pixel format
      totalb += m.size;
    }

    // Might not be the case on systems with unified memory?
    total *= 2; // Account that the browser typically keeps a system ram staging buffer on top of the gpu-allocated memory.
  }

  // const gencols = (col: string) => `bg-${col}-100 border-${col}-400 text-${col}-700 `;

  // classes are stated explicitly so that tailwind picks up on them
  function gencols(color: string) {
    if (color === "green") {
      return "bg-green-100 text-green-800 border-green-400";
    } else if (color === "yellow") {
      return "bg-yellow-100 text-yellow-800 border-yellow-400";
    } else if (color === "red") {
      return "bg-red-100 text-red-800 border-red-400";
    }
    return ""; // Default or empty
  }
  $: $roomSettings.listable = roomType === "public";
  $: if (mediaItems) flipError = updateFlip();
  $: if (mediaItems) doHEVCCheck();
  $: if (mediaItems) doRAMUsageEst();
</script>

<form class="space-y-4" on:submit={handleSubmit}>
  <div class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-y-4 gap-x-6 p-4">
    <div class="space-y-4">
      <MediaSelector bind:files={params.files} on:error={onImageSelectorError} on:mediaLoad={onImageSelectorMediaLoad} />

      <PiecesCount
        bind:pieces={$roomSettings.pieces}
        {mediaItems}
        bind:voronoi={$roomSettings.voronoi}
        on:estimation={({ detail }) => {
          piecesEstimation = detail;
        }} />

      {#if otherError}
        <div class="bg-yellow-100 border border-yellow-400 text-red-700 px-4 py-3 rounded relative alert variant-ghost-error" role="alert">
          <div class="alert-message text-sm">
            {otherError}
          </div>
        </div>
      {/if}

      {#if total !== 0}
        <div
          class={cn(
            "border px-4 py-3 rounded relative alert text-black-100 variant-ghost-error",
            total < 2 ** 29 ? gencols("green") : total < 2 ** 30 ? gencols("yellow") : gencols("red"),
          )}
          role="alert">
          <div class="alert-message text-sm">
            {t("createRoom.memoryEstimate", $translations).replace("{memory}", formatBytes(total)).replace("{download}", formatBytes(totalb))}
          </div>
        </div>
      {/if}

      {#if $isPWA}
        <div class="p-3 bg-zinc-850 border border-zinc-700 rounded-lg text-center select-none">
          <p class="font-semibold text-sm text-green-400">{t("createRoom.offline", $translations)}</p>
          <p class="text-xs text-muted-foreground">{t("createRoom.offlineDescription", $translations)}</p>
        </div>
      {:else}
        <Tabs.Root bind:value={roomType}>
          <Tabs.List class="w-full h-auto">
            <Tabs.Trigger value="private" class="w-full flex flex-col">
              <p>{t("createRoom.private", $translations)}</p>
              <p class="text-muted-foreground text-xs">{t("createRoom.privateDescription", $translations)}</p>
            </Tabs.Trigger>
            <Tabs.Trigger value="public" class="w-full flex flex-col">
              <p>{t("createRoom.public", $translations)}</p>
              <p class="text-muted-foreground text-xs">{t("createRoom.publicDescription", $translations)}</p>
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      {/if}

      <div class="grid w-full items-center gap-1.5">
        <Label for="roomname">{t("createRoom.roomName", $translations)}</Label>
        <Input type="text" id="roomname" placeholder={t("createRoom.newRoom", $translations)} maxlength={72} spellcheck={false} bind:value={params.name} />
      </div>

      {#if $roomSettings.listable}
        <RoomTagSelector bind:tags={$roomSettings.tags} />

        <div class="grid w-full items-center gap-1.5">
          <Label for="secretkey">
            <span>{t("createRoom.secretKey", $translations)}</span>
            <span class="text-muted-foreground">{t("createRoom.secretKeyOptional", $translations)}</span>
          </Label>
          <Input
            type="text"
            id="secretkey"
            placeholder={t("createRoom.secretKeyPlaceholder", $translations)}
            maxlength={25}
            spellcheck={false}
            bind:value={$roomSettings.secretkey} />
        </div>
      {/if}

      <Input
        class="w-full"
        type="text"
        id="urlname"
        placeholder={t("createRoom.urlPlaceholder", $translations)}
        maxlength={21}
        spellcheck={false}
        bind:value={params.urlname} />
    </div>

    <Separator orientation="vertical" class="hidden md:block" />

    <div class="space-y-4">
      <Accordion.Root multiple value={["game-settings"]} class="space-y-2 ">
        <Accordion.Item value="game-settings">
          <Accordion.Trigger class="bg-muted rounded-lg p-2">
            <div class="flex items-center justify-center space-x-3">
              <Fa icon={faGear} size="lg" fw class="text-blue-500" />
              <span>{t("createRoom.gameSettings", $translations)}</span>
            </div>
          </Accordion.Trigger>
          <Accordion.Content class="px-2 pt-3">
            <div class="flex flex-col gap-y-2">
              <Checkbox
                id="nsfw"
                bind:checked={$roomSettings.nsfw}
                label={t("createRoom.nsfw", $translations)}
                description={Math.random() < 0.5
                  ? t("createRoom.nsfwJoke1", $translations)
                  : t("createRoom.nsfwJoke2", $translations)} />
              <Checkbox id="jukebox" bind:checked={$roomSettings.juke} label={t("createRoom.jukebox", $translations)} description={t("createRoom.jukeboxDescription", $translations)} />
              {#if $roomSettings.juke}
                <div transition:fly={{ x: 100, duration: 175 }} class="flex flex-col gap-y-2 md:flex-row md:gap-5">
                  <Checkbox id="jukemusic" bind:checked={$roomSettings.jukemusic} label={t("createRoom.nonMusic", $translations)} />
                  <Checkbox id="jigchan" bind:checked={$roomSettings.jigchan} label={t("createRoom.jigchan", $translations)}>
                    <ul slot="help" class="text-sm">
                      <li>{t("createRoom.jigchanHelp1", $translations)}</li>
                      <li>{t("createRoom.jigchanHelp2", $translations)}</li>
                      <li>{t("createRoom.jigchanHelp3", $translations)}</li>
                    </ul>
                  </Checkbox>
                </div>
              {/if}

              <Checkbox id="scores" bind:checked={$roomSettings.scores} label={t("createRoom.scores", $translations)} description={t("createRoom.scoresDescription", $translations)} />
              <Checkbox id="votekick" bind:checked={$roomSettings.votekick} label={t("createRoom.voteKick", $translations)} description={t("createRoom.voteKickDescription", $translations)} />

              <Checkbox
                id="auth"
                bind:checked={$roomSettings.auth}
                label={t("createRoom.auth", $translations)}
                description={t("createRoom.authDescription", $translations)} />

              <Checkbox
                id="selfdestruct"
                bind:checked={$roomSettings.sd}
                label={t("createRoom.selfDestruct", $translations)}
                description={t("createRoom.selfDestructDescription", $translations)} />

              <Checkbox id="forceanon" bind:checked={$roomSettings.forceanon} label={t("createRoom.forceAnonymous", $translations)} description={t("createRoom.forceAnonymousDescription", $translations)} />
            </div>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="restrictions">
          <Accordion.Trigger class="bg-muted rounded-lg p-2">
            <div class="flex items-center justify-center space-x-3">
              <Fa icon={faLock} size="lg" fw class="text-pink-500" />
              <span>{t("createRoom.restrictions", $translations)}</span>
            </div>
          </Accordion.Trigger>
          <Accordion.Content class="px-2 pt-3">
            <div class="flex flex-col gap-y-2">
              <Checkbox id="preview" bind:checked={$roomSettings.preview} label={t("createRoom.disablePreview", $translations)} />
              <Checkbox id="nomultisel" bind:checked={$roomSettings.nomultisel} label={t("createRoom.noMultiSelect", $translations)} />
              <Checkbox id="nolock" bind:checked={$roomSettings.nolock} label={t("createRoom.noLock", $translations)} />
              <Checkbox id="norect" bind:checked={$roomSettings.norect} label={t("createRoom.noRectangle", $translations)} />
              <Checkbox id="nostack" bind:checked={$roomSettings.nostack} label={t("createRoom.noStack", $translations)} />
            </div>
          </Accordion.Content>
        </Accordion.Item>
        <div use:aids={["rot"]}>
          <Accordion.Item value="mode-settings">
            <Accordion.Trigger class="bg-muted rounded-lg p-2">
              <div class="flex items-center justify-center space-x-3">
                <Fa icon={faGamepad} size="lg" fw class="text-green-500" />
                <span>{t("createRoom.modeSettings", $translations)}</span>
              </div>
            </Accordion.Trigger>
            <Accordion.Content class="px-2 pt-3">
              <div class="flex flex-col gap-y-2">
              <div id="rot" use:aids>
                <Checkbox  id="rot" bind:checked={$roomSettings.rotation} label={t("createRoom.rotation", $translations)} description={t("createRoom.rotationDescription", $translations)} />
              </div>
                <Checkbox
                  disabled={!!flipError}
                  id="flipping"
                  bind:checked={$roomSettings.flipping}
                  label={t("createRoom.flipping", $translations)}
                  description={t("createRoom.flipDescription", $translations) + (flipError || "")} />
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </div>

        <Accordion.Item value="special-settings">
          <Accordion.Trigger class="bg-muted rounded-lg p-2">
            <div class="flex items-center justify-center space-x-3">
              <Fa icon={faGamepad} size="lg" fw class="text-orange-500" />
              <span>{t("createRoom.specialSettings", $translations)}</span>
            </div>
          </Accordion.Trigger>
          <Accordion.Content class="px-2 pt-3">
            <div class="flex flex-col gap-y-2">
              <div id="rot" use:aids>
                <Checkbox
                  id="rotting"
                  bind:checked={$roomSettings.rotting}
                  label={t("createRoom.rot", $translations)}
                  description={t("createRoom.rotDescription", $translations)} />
              </div>

              <Checkbox
                id="sticky"
                bind:checked={$roomSettings.sticky}
                label={t("createRoom.sticky", $translations)}
                description={t("createRoom.stickyDescription", $translations)} />
            </div>
          </Accordion.Content>
        </Accordion.Item>


        {#if mediaItems.length > 0}
          <Dialog.Root>
            <Dialog.Trigger asChild let:builder>
              <Button builders={[builder]} variant="outline" class="w-full mt-4 bg-muted hover:bg-muted/80">
                <Fa icon={faGear} size="lg" fw class="mr-2 text-blue-500" />
                <span>{t("createRoom.layoutStudioButton", $translations)}</span>
              </Button>
            </Dialog.Trigger>
            <Dialog.Content
              class="max-w-[95vw] md:max-w-[90vw] lg:max-w-[1200px] max-h-[90vh] overflow-y-auto bg-slate-900 text-white border-slate-800">
              <Dialog.Header>
                <Dialog.Title class="text-xl font-bold">{t("createRoom.layoutStudio", $translations)}</Dialog.Title>
                <Dialog.Description class="text-slate-400">
                  {t("createRoom.layoutStudioDescription", $translations)}
                </Dialog.Description>
              </Dialog.Header>
              <div class="mt-4">
                 <PieceLayoutStudio bind:this={layoutStudio} {mediaItems} pieces={$roomSettings.pieces} />
              </div>
            </Dialog.Content>
          </Dialog.Root>
        {/if}

      </Accordion.Root>

    </div>
  </div>

  <div class="flex justify-center py-4">
    <Button disabled={!canCreateRoom} type="submit" variant="default" size="lg">{t("createRoom.createRoom", $translations)}</Button>
  </div>

  <hr />

  <ul class="px-4 pb-2 list-disc list-inside text-sm">
    <li>{t("createRoom.tipInvite", $translations)}</li>
    <li>{t("createRoom.tipQuality", $translations)}</li>
    <li>{t("createRoom.tipBrowser", $translations)}</li>
    <li>{t("createRoom.tipMultiple", $translations)}</li>
    <li>{t("createRoom.tipSize", $translations)}</li>
    <!-- ... -->
  </ul>
</form>

<AlertDialog.Root open={isLoading} closeOnEscape={false} closeOnOutsideClick={false}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{t("createRoom.creatingRoom", $translations)}</AlertDialog.Title>
      <AlertDialog.Description>
        <p class="mb-3">{status}</p>
        <p class="mb-3">{review}</p>
        <Progress max={1} value={progress} />
      </AlertDialog.Description>
    </AlertDialog.Header>
  </AlertDialog.Content>
</AlertDialog.Root>
