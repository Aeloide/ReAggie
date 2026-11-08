import { writable } from "svelte/store";
import type { User } from "$backend/types";

export class WhisperManager {
  whisperedUsers;

  constructor() {
    this.whisperedUsers = writable<User[]>([]);
  }

  addWhisper(user: User) {
    this.whisperedUsers.update((users) => {
      const idx = users.findIndex((u) => user.id === u.id);
      if (idx !== -1) return users;
      return [...users, user];
    });
  }

  removeWhisper(user: User) {
    this.whisperedUsers.update((users) => {
      const idx = users.findIndex((u) => user.id === u.id);
      if (idx === -1) return users;
      return users.filter((_, i) => i !== idx);
    });
  }
}
