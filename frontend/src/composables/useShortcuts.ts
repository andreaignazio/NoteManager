import { onBeforeUnmount, onMounted } from "vue";
import { useShortcutsStore } from "@/stores/shortcuts";
import { useAppActions } from "@/actions/useAppActions";
import { useEditorRegistryStore } from "@/stores/editorRegistry";
import { useBlocksStore } from "@/stores/blocks";
import usePagesStore from "@/stores/pages";

export type ShortcutHandlerContext = {
  event: KeyboardEvent;
  combo: string;
};

export type ShortcutCommand = {
  id: string;
  label?: string;
  keys: string[];
  allowInInputs?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  when?: (ctx: ShortcutHandlerContext) => boolean;
  handler: (ctx: ShortcutHandlerContext) => void | Promise<void>;
};

const DEFAULT_COMMANDS = (): ShortcutCommand[] => {
  const actions = useAppActions();
  const editorRegistry = useEditorRegistryStore();
  const blocksStore = useBlocksStore();
  const pagesStore = usePagesStore();

  const getEditorFromEvent = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest) return null;
    const editorEl = target.closest('[data-block-editor="true"]');
    const blockId = editorEl?.getAttribute?.("data-block-id") ?? null;
    if (!blockId) return null;
    return editorRegistry.getEditor(blockId) ?? null;
  };

  const tryEditorUndo = (event: KeyboardEvent, kind: "undo" | "redo") => {
    const editor = getEditorFromEvent(event);
    if (!editor) return false;
    const can = editor.can?.();
    if (kind === "undo") {
      if (can?.undo?.()) {
        editor.commands?.undo?.();
        return true;
      }
      return false;
    }
    if (can?.redo?.()) {
      editor.commands?.redo?.();
      return true;
    }
    return false;
  };

  const hasBlocksUndo = () => (blocksStore._undoStack?.length ?? 0) > 0;
  const hasBlocksRedo = () => (blocksStore._redoStack?.length ?? 0) > 0;
  const hasPagesUndo = () => (pagesStore._undoStack?.length ?? 0) > 0;
  const hasPagesRedo = () => (pagesStore._redoStack?.length ?? 0) > 0;

  return [
    {
      id: "undo",
      label: "Undo",
      keys: ["Ctrl+Z", "Meta+Z"],
      allowInInputs: true,
      preventDefault: false,
      handler: async ({ event }) => {
        if (tryEditorUndo(event, "undo")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (hasPagesUndo()) {
          event.preventDefault();
          event.stopPropagation();
          await actions.pages.undoLastEntry();
          return;
        }

        if (hasBlocksUndo()) {
          event.preventDefault();
          event.stopPropagation();
          await actions.blocks.undoLastEntry();
        }
      },
    },
    {
      id: "redo",
      label: "Redo",
      keys: ["Ctrl+Shift+Z", "Meta+Shift+Z", "Ctrl+Y"],
      allowInInputs: true,
      preventDefault: false,
      handler: async ({ event }) => {
        if (tryEditorUndo(event, "redo")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (hasPagesRedo()) {
          event.preventDefault();
          event.stopPropagation();
          await actions.pages.redoLastEntry();
          return;
        }

        if (hasBlocksRedo()) {
          event.preventDefault();
          event.stopPropagation();
          await actions.blocks.redoLastEntry();
        }
      },
    },
  ];
};

const NORMALIZED_SPECIAL_KEYS: Record<string, string> = {
  " ": "Space",
  Escape: "Esc",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
};

const isInputLike = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase?.() ?? "";
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
};

const normalizeKey = (key: string): string => {
  if (!key) return "";
  if (NORMALIZED_SPECIAL_KEYS[key]) return NORMALIZED_SPECIAL_KEYS[key];
  if (key.length === 1) return key.toUpperCase();
  return key[0].toUpperCase() + key.slice(1);
};

const normalizeCombo = (combo: string): string => {
  return combo
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => normalizeKey(part))
    .join("+");
};

const eventToCombo = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (e.metaKey) parts.push("Meta");
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(normalizeKey(e.key));
  return parts.join("+");
};

export function useShortcuts(options?: { commands?: ShortcutCommand[] }) {
  const shortcutsStore = useShortcutsStore();
  const commands = options?.commands ?? DEFAULT_COMMANDS();

  const getCommandByCombo = (combo: string): ShortcutCommand | null => {
    for (const cmd of commands) {
      if (shortcutsStore.isDisabled(cmd.id)) continue;
      const keys = shortcutsStore.getKeys(cmd.id, cmd.keys).map(normalizeCombo);
      if (keys.includes(combo)) return cmd;
    }
    return null;
  };

  const onKeyDown = async (e: KeyboardEvent) => {
    //console.log("onKeyDown", e);
    if (!shortcutsStore.enabled) return;
    if (e.repeat) return;

    const combo = normalizeCombo(eventToCombo(e));
    if (!combo) return;

    const cmd = getCommandByCombo(combo);
    if (!cmd) return;

    if (isInputLike(e.target) && !cmd.allowInInputs) return;

    const ctx: ShortcutHandlerContext = { event: e, combo };
    if (cmd.when && !cmd.when(ctx)) return;

    if (cmd.preventDefault !== false) e.preventDefault();
    if (cmd.stopPropagation) e.stopPropagation();

    await cmd.handler(ctx);
  };

  onMounted(() => {
    window.addEventListener("keydown", onKeyDown, true);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeyDown, true);
  });
}

export default useShortcuts;
