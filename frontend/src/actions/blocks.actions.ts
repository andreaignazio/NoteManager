import { useBlocksStore } from "@/stores/blocks";
import { nextTick } from "vue";
import { useUIOverlayStore } from "@/stores/uiOverlay";

export function useBlockActions() {
  const blocksStore = useBlocksStore();
  const uiOverlay = useUIOverlayStore();

  async function insertBlockAfterAndFocus(blockId: string) {
    const pageId = blocksStore.blocksById[blockId]?.pageId;
    if (!pageId) return;
    const newId = await blocksStore.addNewBlock(
      pageId,
      { type: "p", content: { text: "" } },
      blockId,
    );
    await nextTick();
    blocksStore.requestFocus(newId, 0);
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
    blocksStore.duplicateBlockInPlace(pageId, blockId);
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

    // 2) delete
    await blocksStore.deleteBlock(blockId, pageId);

    return { ok: true as const };
  }

  async function setBlockType(blockId: string, newType: string) {
    await blocksStore.updateBlockType(blockId, newType);
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
    moveBlockTreeToPage,
    duplicateBlock,
    deleteBlockFlow,
    setBlockType,
    setBlockTextColor,
    setBlockBgColor,
    setBlockFont,
  };
}
