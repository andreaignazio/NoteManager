import { useBlocksStore } from "@/stores/blocks";
import { nextTick } from "vue";
import { useUIOverlayStore } from "@/stores/uioverlay";

export function useBlockActions() {
  const blocksStore = useBlocksStore();
  const uiOverlay = useUIOverlayStore();

  const clone = <T>(value: T): T =>
    value == null ? (value as T) : JSON.parse(JSON.stringify(value));

  const snapshotBlock = (blockId: string | number) => {
    const b = blocksStore.blocksById[String(blockId)];
    if (!b) return null;
    return {
      id: String(b.id),
      pageId: String(b.pageId),
      parentId: b.parentId ?? null,
      position: String(b.position ?? ""),
      kind: b.kind ?? "block",
      type: b.type,
      content: clone(b.content ?? {}),
      props: clone(b.props ?? {}),
      layout: clone(b.layout ?? {}),
      width: b.width ?? null,
    };
  };

  const pushUpdateUndo = (args: {
    pageId: string | number;
    blockId: string | number;
    prevPatch: Record<string, any>;
    nextPatch: Record<string, any>;
    label?: string;
  }) => {
    blocksStore.pushUndoEntry({
      pageId: String(args.pageId),
      undo: {
        ops: [
          {
            op: "update" as const,
            id: String(args.blockId),
            patch: args.prevPatch,
          },
        ],
      },
      redo: {
        ops: [
          {
            op: "update" as const,
            id: String(args.blockId),
            patch: args.nextPatch,
          },
        ],
      },
      label: args.label,
    });
  };

  const pushCreateUndo = (
    snap: ReturnType<typeof snapshotBlock>,
    label?: string,
  ) => {
    if (!snap) return;
    blocksStore.pushUndoEntry({
      pageId: String(snap.pageId),
      undo: { ops: [{ op: "delete" as const, id: String(snap.id) }] },
      redo: {
        ops: [
          {
            op: "create" as const,
            node: {
              id: snap.id,
              kind: snap.kind ?? "block",
              parentId: snap.parentId ?? null,
              position: String(snap.position ?? ""),
              type: snap.type,
              content: snap.content ?? {},
              props: snap.props ?? {},
              layout: snap.layout ?? {},
              width: snap.width ?? null,
            },
          },
        ],
      },
      label,
    });
  };

  async function insertBlockAfterAndFocus(blockId: string) {
    const pageId = blocksStore.blocksById[blockId]?.pageId;
    if (!pageId) return;
    const newId = await addNewBlock(
      pageId,
      { type: "p", content: { text: "" } },
      blockId,
    );
    await nextTick();
    blocksStore.requestFocus(newId, 0);
  }

  async function addNewBlock(
    pageId: string | number,
    payload: { type?: string; content?: any },
    blockId: string | number | null,
    opts?: { undo?: boolean; label?: string },
  ) {
    const newId = await blocksStore.addNewBlock(pageId, payload, blockId);
    const snap = snapshotBlock(newId);
    if (opts?.undo !== false) pushCreateUndo(snap, opts?.label ?? "addBlock");
    return newId;
  }

  async function addNewBlockAfter(
    pageId: string | number,
    payload: { type?: string; content?: any },
    blockId: string | number | null,
    opts?: { undo?: boolean; label?: string },
  ) {
    const newId = await blocksStore.addNewBlockAfter(pageId, payload, blockId);
    const snap = snapshotBlock(newId);
    if (opts?.undo !== false) pushCreateUndo(snap, opts?.label ?? "addBlock");
    return newId;
  }

  async function moveBlockTreeToPage(blockId: string, targetPageId: string) {
    const block = blocksStore.blocksById[blockId];
    if (!block) return;
    const rootId = blockId;
    const fromPageId = blocksStore.blocksById[blockId]?.pageId;
    const toPageId = targetPageId;
    if (!fromPageId || !toPageId) return;
    await blocksStore.transferSubtreeToPage({
      fromPageId,
      toPageId,
      rootId,
    });
  }

  async function duplicateBlock(blockId: string) {
    console.log("[useBlockActions] duplicateBlock", blockId);
    const pageId = blocksStore.blocksById[blockId]?.pageId ?? null;
    if (!pageId) return;

    const beforeIds = new Set(
      (blocksStore.blocksByPage?.[String(pageId)] ?? []).map(String),
    );

    await blocksStore.duplicateBlockInPlace(pageId, blockId);

    const afterIds = (blocksStore.blocksByPage?.[String(pageId)] ?? []).map(
      String,
    );
    const newIds = afterIds.filter((id) => !beforeIds.has(String(id)));

    if (newIds.length) {
      const newBlocks = newIds
        .map((id) => blocksStore.blocksById?.[String(id)])
        .filter(Boolean);

      const ordered = [] as any[];
      const pending = new Map(
        newBlocks.map((b) => [String(b.id), b]) as [string, any][],
      );

      let safety = pending.size + 5;
      while (pending.size && safety-- > 0) {
        for (const [id, b] of Array.from(pending.entries())) {
          const pid = b.parentId != null ? String(b.parentId) : null;
          if (!pid || !pending.has(pid)) {
            ordered.push(b);
            pending.delete(id);
          }
        }
      }

      if (pending.size) {
        for (const b of pending.values()) ordered.push(b);
      }

      blocksStore.pushUndoEntry({
        pageId: String(pageId),
        undo: { ops: newIds.map((id) => ({ op: "delete" as const, id })) },
        redo: {
          ops: ordered.map((b) => ({
            op: "create" as const,
            node: {
              id: String(b.id),
              kind: b.kind ?? "block",
              parentId: b.parentId ?? null,
              position: String(b.position ?? ""),
              type: b.type,
              content: clone(b.content ?? {}),
              props: clone(b.props ?? {}),
              layout: clone(b.layout ?? {}),
              width: b.width ?? null,
            },
          })),
        },
        label: "duplicateBlock",
      });
    }
  }

  async function deleteBlockFlow(opts: {
    blockId: string | number;
    pageId: string | number;
    anchorKey: string;
    placement?: string;
    // UI copy override opzionali
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
  }) {
    const blockId = String(opts.blockId);
    const pageId = String(opts.pageId);

    // 1) confirm
    const res = await uiOverlay.requestConfirm({
      menuId: "block.deleteConfirm",
      anchorKey: opts.anchorKey,
      payload: {
        title: opts.title ?? "Delete block?",
        message: opts.message ?? "This will permanently remove the block.",
        confirmText: opts.confirmText ?? "Yes, I'm sure",
        cancelText: opts.cancelText ?? "No, cancel",
        danger: true,
        iconId: "lucide:trash-2",
        // se vuoi un checkbox tipo “also delete children”, lo aggiungi qui in futuro
      },
    });

    if (!res.ok) return { ok: false as const, reason: res.reason };

    const before = snapshotBlock(blockId);
    const childIds =
      blocksStore.childrenByParentId?.[pageId]?.[String(blockId)] ?? [];
    const childPositions = childIds.reduce(
      (acc: Record<string, string>, id: string | number) => {
        const pos = blocksStore.blocksById[String(id)]?.position ?? "";
        acc[String(id)] = String(pos);
        return acc;
      },
      {},
    );

    // 2) delete
    await blocksStore.deleteBlock(blockId, pageId);

    if (before) {
      const undoOps: any[] = [
        {
          op: "create" as const,
          node: {
            id: before.id,
            kind: before.kind ?? "block",
            parentId: before.parentId ?? null,
            position: String(before.position ?? ""),
            type: before.type,
            content: before.content ?? {},
            props: before.props ?? {},
            layout: before.layout ?? {},
            width: before.width ?? null,
          },
        },
        ...childIds.map((id: string | number) => ({
          op: "move" as const,
          id: String(id),
          parentId: String(before.id),
          position: String(childPositions[String(id)] ?? ""),
        })),
      ];

      const redoOps: any[] = [
        ...childIds.map((id: string | number) => ({
          op: "move" as const,
          id: String(id),
          parentId: before.parentId ?? null,
          position: String(childPositions[String(id)] ?? ""),
        })),
        { op: "delete" as const, id: String(before.id) },
      ];

      blocksStore.pushUndoEntry({
        pageId: String(pageId),
        undo: { ops: undoOps },
        redo: { ops: redoOps },
        label: "deleteBlock",
      });
    }

    return { ok: true as const };
  }

  async function setBlockType(blockId: string, newType: string) {
    const before = snapshotBlock(blockId);
    await blocksStore.updateBlockType(blockId, newType);
    const after = snapshotBlock(blockId);
    if (before && after) {
      pushUpdateUndo({
        pageId: before.pageId,
        blockId,
        prevPatch: {
          type: before.type,
          props: before.props ?? {},
          content: before.content ?? {},
        },
        nextPatch: {
          type: after.type,
          props: after.props ?? {},
          content: after.content ?? {},
        },
        label: "setBlockType",
      });
    }
  }

  async function moveBlock(
    pageId: string | number,
    blockId: string | number,
    params: { parentId: string | null; position: string },
  ) {
    const before = snapshotBlock(blockId);
    await blocksStore.moveBlock(pageId, blockId, params);
    const after = snapshotBlock(blockId);
    if (
      before &&
      after &&
      String(before.parentId ?? "") === String(after.parentId ?? "") &&
      String(before.position ?? "") === String(after.position ?? "")
    ) {
      return;
    }
    if (before && after) {
      blocksStore.pushUndoEntry({
        pageId: String(pageId),
        undo: {
          ops: [
            {
              op: "move" as const,
              id: String(blockId),
              parentId: before.parentId ?? null,
              position: String(before.position ?? ""),
            },
          ],
        },
        redo: {
          ops: [
            {
              op: "move" as const,
              id: String(blockId),
              parentId: after.parentId ?? null,
              position: String(after.position ?? ""),
            },
          ],
        },
        label: "moveBlock",
      });
    }
  }

  async function updateBlockContent(
    blockId: string | number,
    patch: Record<string, any>,
    opts?: { undo?: boolean; label?: string },
  ) {
    const before = opts?.undo ? snapshotBlock(blockId) : null;
    await blocksStore.updateBlockContent(blockId, patch);
    const after = opts?.undo ? snapshotBlock(blockId) : null;
    if (before && after) {
      pushUpdateUndo({
        pageId: before.pageId,
        blockId,
        prevPatch: { content: before.content ?? {} },
        nextPatch: { content: after.content ?? {} },
        label: opts?.label ?? "updateBlockContent",
      });
    }
  }

  async function updateBlockIcon(
    blockId: string | number,
    iconId: string | null,
  ) {
    const before = snapshotBlock(blockId);
    await blocksStore.updateBlockIcon(blockId, iconId);
    const after = snapshotBlock(blockId);
    if (before && after) {
      pushUpdateUndo({
        pageId: before.pageId,
        blockId,
        prevPatch: { props: before.props ?? {} },
        nextPatch: { props: after.props ?? {} },
        label: "updateBlockIcon",
      });
    }
  }

  async function updateBlockStyle(
    blockId: string | number,
    stylePatch: Record<string, any>,
  ) {
    const before = snapshotBlock(blockId);
    await blocksStore.updateBlockStyle(blockId, stylePatch);
    const after = snapshotBlock(blockId);
    if (before && after) {
      pushUpdateUndo({
        pageId: before.pageId,
        blockId,
        prevPatch: { props: before.props ?? {} },
        nextPatch: { props: after.props ?? {} },
        label: "updateBlockStyle",
      });
    }
  }

  async function indentBlock(
    pageId: string | number,
    blockId: string | number,
  ) {
    await blocksStore.indentBlock(pageId, blockId);
  }

  async function outdentBlock(
    pageId: string | number,
    blockId: string | number,
  ) {
    await blocksStore.outdentBlock(pageId, blockId);
  }

  async function undoLastEntry(pageId?: string | number) {
    await blocksStore.undoLastEntry(pageId);
  }

  async function redoLastEntry(pageId?: string | number) {
    await blocksStore.redoLastEntry(pageId);
  }

  function setCurrentBlock(blockId: string | number) {
    blocksStore.setCurrentBlock(blockId);
  }

  function clearCurrentBlock() {
    blocksStore.clearCurrentBlock();
  }

  function requestFocus(blockId: string | number, caret: number = 0) {
    blocksStore.requestFocus(blockId, caret);
  }

  function clearFocusRequest() {
    blocksStore.clearFocusRequest();
  }

  function expandBlock(blockId: string | number) {
    blocksStore.expandBlock(blockId);
  }

  function toggleExpandBlock(blockId: string | number) {
    blocksStore.toggleExpandBlock(blockId);
  }

  async function addChildBlock(
    pageId: string | number,
    parentId: string | number,
    payload: { type?: string; content?: any },
    opts?: { undo?: boolean; label?: string },
  ) {
    const newId = await blocksStore.addBlockAfterWithParent(pageId, payload, {
      parentId,
    });
    const snap = snapshotBlock(newId);
    if (opts?.undo !== false)
      pushCreateUndo(snap, opts?.label ?? "addChildBlock");
    return newId;
  }

  async function setBlockTextColor(blockId: string, token: string) {
    await blocksStore.updateBlockStyle(blockId, { textColor: token });
  }

  async function setBlockBgColor(blockId: string, token: string) {
    await blocksStore.updateBlockStyle(blockId, { bgColor: token });
  }

  async function setBlockFont(blockId: string, fontId: string) {
    await blocksStore.updateBlockStyle(blockId, { font: fontId });
  }

  return {
    insertBlockAfterAndFocus,
    addNewBlock,
    addNewBlockAfter,
    moveBlockTreeToPage,
    duplicateBlock,
    deleteBlockFlow,
    setBlockType,
    moveBlock,
    updateBlockContent,
    updateBlockIcon,
    updateBlockStyle,
    indentBlock,
    outdentBlock,
    undoLastEntry,
    redoLastEntry,
    setCurrentBlock,
    clearCurrentBlock,
    requestFocus,
    clearFocusRequest,
    expandBlock,
    toggleExpandBlock,
    addChildBlock,
    setBlockTextColor,
    setBlockBgColor,
    setBlockFont,
  };
}
