import { defineStore } from "pinia";

export interface ShortcutBindings {
  [commandId: string]: string[];
}

export interface ShortcutDisabledMap {
  [commandId: string]: boolean;
}

interface ShortcutsStoreState {
  enabled: boolean;
  bindings: ShortcutBindings;
  disabled: ShortcutDisabledMap;
}

export const useShortcutsStore = defineStore("shortcuts", {
  state: (): ShortcutsStoreState => ({
    enabled: true,
    bindings: {},
    disabled: {},
  }),

  getters: {
    getKeys:
      (state) =>
      (commandId: string, fallback: string[] = []): string[] => {
        return state.bindings[commandId] ?? fallback;
      },

    isDisabled:
      (state) =>
      (commandId: string): boolean => {
        return !!state.disabled[commandId];
      },
  },

  actions: {
    setEnabled(v: boolean): void {
      this.enabled = !!v;
    },

    setBindings(commandId: string, keys: string[]): void {
      this.bindings = { ...this.bindings, [commandId]: keys };
    },

    resetBindings(commandId?: string): void {
      if (!commandId) {
        this.bindings = {};
        return;
      }
      const next = { ...this.bindings };
      delete next[commandId];
      this.bindings = next;
    },

    disableCommand(commandId: string): void {
      this.disabled = { ...this.disabled, [commandId]: true };
    },

    enableCommand(commandId: string): void {
      const next = { ...this.disabled };
      delete next[commandId];
      this.disabled = next;
    },

    toggleCommand(commandId: string, v?: boolean): void {
      const next = { ...this.disabled };
      const shouldDisable = typeof v === "boolean" ? !v : !next[commandId];
      if (shouldDisable) next[commandId] = true;
      else delete next[commandId];
      this.disabled = next;
    },
  },
});

export default useShortcutsStore;
