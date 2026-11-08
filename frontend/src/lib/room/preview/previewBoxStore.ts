import { getAssetUrl } from "$lib";
import { derived, writable } from "svelte/store";
import { roomDef } from "../stores";
import type { PreviewItem } from "$lib/create-room/types";

interface PreviewBoxState {
  selectedMediaIndex: number;
  thumbnailVisible: boolean;
  overlayVisible: boolean;
}

interface OverlayImageTransformState {
  translate: string;
  scale: number;
}

export const overlayImageTransform = writable<OverlayImageTransformState>({
  translate: "0px 0px",
  scale: 1,
});

export const previewBox = (() => {
  const store = writable<PreviewBoxState>({
    selectedMediaIndex: 0,
    thumbnailVisible: false,
    overlayVisible: false,
  });

  return {
    subscribe: store.subscribe,
    selectIndex: (index: number) =>
      store.update((x) => ({ ...x, selectedMediaIndex: index })),
    setThumbnailVisible: (visible: boolean) => {
      store.update((x) => ({ ...x, thumbnailVisible: visible }));
    },
    setOverlayVisible: (visible: boolean) => {
      store.update((x) => ({ ...x, overlayVisible: visible }));
    },
  };
})();

export const previewBoxSelectedItem = derived(
  [previewBox, roomDef],
  ([$store, $roomDef]) => {
    if (!$roomDef || $roomDef.sets.length <= $store.selectedMediaIndex) {
      return undefined;
    }

    const set = $roomDef.sets[$store.selectedMediaIndex];
    let item: Omit<PreviewItem, 'size'> = {
      objectUrl: getAssetUrl(set.image),
      isImage: !set.isvideo,
    };

    return item;
  }
);
