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

  return {
    insertBlockAfterAndFocus,
  };
}
