import { writable } from "svelte/store";
import type { NameTag, NameTagEvent, User } from "$room/types";
import type { GameGroup } from "$room/game";

function getTranslate(x: number, y: number, viewX: number, viewY: number, viewScale: number) {
  const newX = (viewX + x) * viewScale;
  const newY = (viewY + y) * viewScale;
  return `${newX}px ${newY}px`;
}

function calculateTagXY(groups: GameGroup[]) {
  const rect = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 0, 0];
  groups.forEach((group) => {
    rect[0] = Math.min(rect[0], group.x);
    rect[1] = Math.min(rect[1], group.y);
    rect[2] = Math.max(rect[2], group.x);
    rect[3] = Math.max(rect[3], group.y);
  });

  const [x1, y1, x2, y2] = rect;
  const x = (x1 + x2) * 0.5;
  const y = (y1 + y2) * 0.5;

  return { x, y };
}

export const createNameTagsStore = () => {
  const store = writable<NameTag[]>([]);

  let lastViewX = 0;
  let lastViewY = 0;

  function drawTags(viewX: number, viewY: number, scale: number, groups: GameGroup[]) {
    store.update((tags) => {
      const selectedGroupsByUserId: GameGroup[][] = [];

      groups.forEach((group) => {
        if (!group.user) return;
        const id = group.user.id;
        const groups = (selectedGroupsByUserId[id] ??= []);
        groups.push(group);
      });

      const viewHasMoved = lastViewX != viewX || lastViewY != viewY;
      for (let tag of tags) {
        const selection = selectedGroupsByUserId[tag.user.id];
        if (selection) {
          const { x, y } = calculateTagXY(selection);
          tag.groups = selection;
          tag.event = undefined;
          if (tag.hidden) {
            tag.hidden = false;
          }

          if (!viewHasMoved && tag.x === x && tag.y === y) continue;
          tag.x = x;
          tag.y = y;
          tag.translate = getTranslate(x, y, viewX, viewY, scale);
        } else {
          if (viewHasMoved) {
            tag.translate = getTranslate(tag.x, tag.y, viewX, viewY, scale);
          }

          if (!tag.hidden) {
            if (tag.groups.length > 0) {
              const { x, y } = calculateTagXY(tag.groups);
              tag.x = x;
              tag.y = y;
              tag.translate = getTranslate(tag.x, tag.y, viewX, viewY, scale);
              tag.groups = [];
            }
            tag.hidden = true;
          }
        }
      }
      lastViewX = viewX;
      lastViewY = viewY;
      return tags;
    });
  }

  function sync(users: User[]) {
    store.update((tags) => {
      const newTags: NameTag[] = [];
      for (const user of users) {
        const tag = tags.find((tag) => tag.user.id === user.id);
        if (tag) {
          tag.user = user;
          newTags.push(tag);
        } else {
          newTags.push({
            user,
            x: 0,
            y: 0,
            groups: [],
            translate: "",
            hidden: true,
          });
        }
      }
      return newTags;
    });
  }

  function drawEvent(userId: number, x: number, y: number, viewX: number, viewY: number, viewScale: number, event?: NameTagEvent) {
    store.update((tags) => {
      const tag = tags.find((tag) => tag.user.id === userId);
      if (!tag) {
        return tags;
      }

      tag.x = x;
      tag.y = y;
      tag.translate = getTranslate(x, y, viewX, viewY, viewScale);
      tag.hidden = false;
      tag.event = event;

      return tags;
    });
  }

  return {
    subscribe: store.subscribe,
    drawTags,
    drawEvent,
    sync,
    reset: () => store.set([]),
  };
};
