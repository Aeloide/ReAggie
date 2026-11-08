export function modalBodyEvents(node: HTMLElement) {
  const onKeyDown = (event: KeyboardEvent) => {
    // prevent window from receiving keydown events from modal
    if (event.code !== "Escape") {
      event.stopPropagation();
      return;
    }
  };

  node.addEventListener("keydown", onKeyDown, true);

  return {
    destroy() {
      node.removeEventListener("keydown", onKeyDown, true);
    },
  };
}
