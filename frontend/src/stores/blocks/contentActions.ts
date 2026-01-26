// Content and styling actions
import api from "@/services/api";
import { DEFAULT_BLOCK_TYPE } from "@/domain/blockTypes";
import { normalizeProps, isTextToken, isBgToken } from "@/theme/colorsCatalog";
import { DEFAULT_ICON_ID } from "@/icons/catalog";
import { isFontToken } from "@/domain/fontCatalog";
import type {
  Block,
  BlockContent,
  BlockStyle,
  BlockProps,
  BlocksStoreState,
} from "./types.js";

export async function updateBlockContent(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    _contentTokens: Record<string, number>;
  },
  blockId: string | number,
  patch: Partial<BlockContent>,
): Promise<void> {
  const blockIdStr = String(blockId);
  const editedBlock = this.blocksById[blockIdStr];
  if (!editedBlock) return;

  if (!this._contentTokens) this._contentTokens = {};

  const token = (this._contentTokens[blockIdStr] =
    (this._contentTokens[blockIdStr] ?? 0) + 1);

  // safe clone
  const previousContent = JSON.parse(JSON.stringify(editedBlock.content ?? {}));
  const nextContent = { ...previousContent, ...patch };

  // optimistic
  editedBlock.content = nextContent;

  try {
    await api.patch(`/blocks/${blockIdStr}/`, { content: nextContent });

    if (this._contentTokens[blockIdStr] !== token) return;
  } catch (error) {
    if (this._contentTokens[blockIdStr] === token) {
      editedBlock.content = previousContent;
    }
    console.warn(
      "Error updating block:",
      (error as any)?.response?.data ?? error,
    );
    throw error;
  }
}

export function buildNextProps(
  this: BlocksStoreState,
  existingProps: any,
  stylePatch: Partial<BlockStyle>,
): BlockProps {
  const base = normalizeProps(existingProps);
  const prevStyle = base.style ?? {};
  const next: BlockProps = {
    ...base,
    style: {
      ...prevStyle,
      ...stylePatch,
    },
  };
  return normalizeProps(next);
}

export async function updateBlockType(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    buildNextProps: (
      existingProps: any,
      stylePatch: Partial<BlockStyle>,
    ) => BlockProps;
  },
  blockId: string | number,
  newType: string,
): Promise<void> {
  const blockIdStr = String(blockId);
  const b = this.blocksById[blockIdStr];
  if (!b) return;

  const previousType = b.type;
  const previousProps = b.props;
  const previousContent = b.content;

  let nextProps = previousProps;
  let nextContent = previousContent;

  const prevStyle = normalizeProps(previousProps).style ?? {};
  const prevBg = prevStyle.bgColor ?? "default";

  if (newType === "code" && prevBg === "default") {
    nextProps = this.buildNextProps(previousProps, { bgColor: "gray_bg" });
  }
  if (previousType === "code" && newType !== "code" && prevBg === "gray_bg") {
    nextProps = this.buildNextProps(previousProps, { bgColor: "default" });
  }

  if (newType === "callout" && prevBg === "default") {
    nextProps = this.buildNextProps(previousProps, {
      bgColor: "darkgray_bg",
    });
  }
  if (
    previousType === "callout" &&
    newType !== "callout" &&
    prevBg === "darkgray_bg"
  ) {
    nextProps = this.buildNextProps(previousProps, { bgColor: "default" });
  }
  if (newType === "callout" && !b.props?.iconId) {
    nextProps.iconId = DEFAULT_ICON_ID;
  }
  if (newType === "toggle") {
    nextContent = { ...(previousContent ?? {}), isExpanded: true };
  }

  // optimistic
  b.type = newType;
  if (nextProps !== previousProps) b.props = nextProps;
  if (nextContent !== previousContent) b.content = nextContent;

  try {
    const payload: Record<string, any> = { type: newType };
    if (nextProps !== previousProps) payload.props = nextProps;
    if (nextContent !== previousContent) payload.content = nextContent;
    await api.patch(`/blocks/${blockIdStr}/`, payload);
  } catch (error) {
    console.warn(
      "Error updating block type:",
      (error as any)?.response?.data ?? error,
    );
    b.type = previousType;
    b.props = previousProps;
    throw error;
  }
}

export async function updateBlockStyle(
  this: BlocksStoreState & { blocksById: Record<string, Block> },
  blockId: string | number,
  stylePatch: Partial<BlockStyle>,
): Promise<void> {
  console.log("updateBlockStyle", blockId, stylePatch);
  const blockIdStr = String(blockId);
  const b = this.blocksById[blockIdStr];
  if (!b) return;

  const prevProps = normalizeProps(b.props);
  const prevStyle = prevProps.style ?? {};
  const nextStyle: BlockStyle = { ...prevStyle };

  if ("textColor" in stylePatch && isTextToken(stylePatch.textColor)) {
    nextStyle.textColor = stylePatch.textColor;
  }
  if ("bgColor" in stylePatch && isBgToken(stylePatch.bgColor)) {
    nextStyle.bgColor = stylePatch.bgColor;
  }
  if ("font" in stylePatch && isFontToken(stylePatch.font)) {
    nextStyle.font = stylePatch.font;
  }

  const nextProps = { ...prevProps, style: nextStyle };

  b.props = nextProps;
  try {
    const res = await api.patch(`/blocks/${blockIdStr}/`, {
      props: nextProps,
    });
    console.log("PATCH", res);
  } catch (e) {
    b.props = prevProps;
    throw e;
  }
}

export async function updateBlockIcon(
  this: BlocksStoreState & { blocksById: Record<string, Block> },
  blockId: string | number,
  iconId: string | null,
): Promise<void> {
  const blockIdStr = String(blockId);
  const b = this.blocksById[blockIdStr];
  if (!b) return;

  const prevProps = b.props ?? {};
  const nextProps: BlockProps = {
    ...prevProps,
    iconId: iconId ?? null,
  };

  b.props = nextProps;

  try {
    await api.patch(`/blocks/${blockIdStr}/`, { props: nextProps });
  } catch (e) {
    b.props = prevProps;
    throw e;
  }
}

export async function patchBlockOptimistic(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    _patchTokens?: Record<string, number>;
  },
  blockId: string | number,
  patch: Partial<Block>,
): Promise<void> {
  const blockIdStr = String(blockId);
  const b = this.blocksById[blockIdStr];
  if (!b) return;

  if (!this._patchTokens) this._patchTokens = {};
  const token = (this._patchTokens[blockIdStr] =
    (this._patchTokens[blockIdStr] ?? 0) + 1);

  const prev = {
    type: b.type,
    props: JSON.parse(JSON.stringify(b.props ?? {})),
    content: JSON.parse(JSON.stringify(b.content ?? {})),
    layout: JSON.parse(JSON.stringify(b.layout ?? {})),
    width: b.width ?? null,
  };

  // optimistic merge (known fields only)
  if (patch && typeof patch === "object") {
    if ("type" in patch) b.type = patch.type as string;
    if ("props" in patch) b.props = patch.props ?? {};
    if ("content" in patch) b.content = patch.content ?? {};
    if ("layout" in patch) b.layout = patch.layout ?? {};
    if ("width" in patch) b.width = patch.width ?? null;
  }

  try {
    await api.patch(`/blocks/${blockIdStr}/`, patch);

    if (this._patchTokens[blockIdStr] !== token) return;
  } catch (error) {
    // rollback if still latest patch
    if (this._patchTokens[blockIdStr] === token) {
      b.type = prev.type;
      b.props = prev.props;
      b.content = prev.content;
      b.layout = prev.layout;
      b.width = prev.width;
    }
    console.warn(
      "Error patching block:",
      (error as any)?.response?.data ?? error,
    );
    throw error;
  }
}

export function patchBlockLocal(
  this: BlocksStoreState & { blocksById: Record<string, Block> },
  blockId: string | number,
  patch: Partial<Block>,
) {
  const id = String(blockId);
  const b = this.blocksById[id];
  if (!b) return;

  if (patch && typeof patch === "object") {
    if ("type" in patch) b.type = patch.type as string;
    if ("props" in patch) b.props = patch.props ?? {};
    if ("content" in patch) b.content = patch.content ?? {};
    if ("layout" in patch) b.layout = patch.layout ?? {};
    if ("width" in patch) b.width = (patch.width as any) ?? null;
  }
}
