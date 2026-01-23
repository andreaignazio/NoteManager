import { useBlocksStore } from "@/stores/blocks";
import { nextTick } from "vue";

export function useBlockActions() {
  const blocksStore = useBlocksStore();

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

  return {
    insertBlockAfterAndFocus,
    moveBlockTreeToPage,
  };
}
