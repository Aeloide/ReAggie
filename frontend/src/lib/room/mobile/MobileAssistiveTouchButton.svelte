<script lang="ts">
  import AssistiveTouchButton, { type ItemElement } from "$lib/components/AssistiveTouchButton.svelte";
  import * as arrangePieces from "$room/arrangePieces";
  import { faExplosion } from "@fortawesome/free-solid-svg-icons/faExplosion";
  import { faLock } from "@fortawesome/free-solid-svg-icons/faLock";
  import { faMinimize } from "@fortawesome/free-solid-svg-icons/faMinimize";
  import { faRotateLeft } from "@fortawesome/free-solid-svg-icons/faRotateLeft";
  import { faTh } from "@fortawesome/free-solid-svg-icons/faTh";
  import { toast } from "svelte-sonner";
  import { debounce, sleep } from "../../../utils";
  import { useGame } from "../hooks/useGame";

  const LOCAL_STORAGE_KEY = "assistiveTouchButtonPosition";

  function loadInitialPosition() {
    const initialPositionRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!initialPositionRaw) {
      return;
    }

    return JSON.parse(initialPositionRaw);
  }

  function savePosition(pos: { x: number; y: number }) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(pos));
  }

  const [savePositionDebounced] = debounce(savePosition, 100);
  const initialPosition = loadInitialPosition();

  const game = useGame();

  function getSelectedGroups() {
    return game.state.groups.filter((x) => x.selected);
  }

  function showToast(msg: string) {
    toast.info(msg, { position: "bottom-center" });
  }

  async function spread(type: "align" | "pack" | "explode") {
    const selectedGroups = getSelectedGroups();
    if (!selectedGroups.length) {
      showToast("Please select groups first");
      return;
    }

    const spreadFunc = type === "align" ? arrangePieces.order : type === "pack" ? arrangePieces.pack : arrangePieces.spread;
    for (let i = 0; i < 15; i++) {
      spreadFunc(selectedGroups);
      await sleep(50);
    }
  }

  let items: ItemElement[] = [
    {
      icon: faLock,
      label: "Lock",
      onClick: () => {
        const selectedGroups = getSelectedGroups();
        if (selectedGroups.length === 1) {
          game.actions.toggleLock(selectedGroups[0]);
        } else if (selectedGroups.length > 1) {
          showToast("Can only lock one group at a time");
        } else {
          showToast("Please select a group first");
        }
      },
    },
    {
      icon: faRotateLeft,
      label: "Undo",
      onClick: () => {
        game.actions.revertGroups();
      },
    },
    {
      icon: faTh,
      label: "Spread Align",
      onClick: () => {
        spread("align");
      },
    },
    {
      icon: faMinimize,
      label: "Spread Pack",
      onClick: () => {
        spread("pack");
      },
    },
    {
      icon: faExplosion,
      label: "Spread Explode",
      onClick: () => {
        spread("explode");
      },
    },
  ];
</script>

<AssistiveTouchButton {items} {initialPosition} onPositionChange={savePositionDebounced} />
