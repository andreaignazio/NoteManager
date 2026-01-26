// Type definitions shared across blocks store modules

export interface BlockStyle {
  textColor?: string;
  bgColor?: string;
  font?: string;
  [key: string]: any;
}

export interface BlockProps {
  style?: BlockStyle;
  iconId?: string | null;
  [key: string]: any;
}

export interface BlockContent {
  text?: string;
  json?: any;
  isExpanded?: boolean;
  language?: string;
  wrap?: boolean;
  [key: string]: any;
}

export interface BlockLayout {
  [key: string]: any;
}

export interface Block {
  id: string;
  pageId: string;
  parentId: string | null;
  kind: "block" | "row" | string;
  type: string;
  content: BlockContent;
  layout: BlockLayout;
  width: string | null;
  position: string;
  version: number;
  updatedAt: string | null;
  props: BlockProps;
}

export interface RawBlock {
  id: string | number;
  page: string | number;
  parent_block: string | number | null;
  kind?: string;
  type: string;
  content?: BlockContent;
  layout?: BlockLayout;
  width?: string | null;
  position?: string;
  version?: number;
  updated_at?: string | null;
  props?: any;
}

export interface FocusRequest {
  blockId: string;
  caret: number;
}

export interface OptionsMenu {
  open: boolean;
  blockId: string | null;
  anchorRect: any;
}

export interface TransactionOp {
  op: "create" | "move" | "update" | "delete";
  id?: string;
  node?: any;
  parentId?: string | null;
  position?: string;
  patch?: Record<string, any>;
}

export interface Transaction {
  ops: TransactionOp[];
}

export interface UndoEntry {
  pageId: string;
  undo: Transaction;
  redo?: Transaction;
  label?: string;
  createdAt?: number;
}

export interface BatchBlockItem {
  tempId?: string;
  kind?: string;
  type?: string;
  content?: BlockContent;
  props?: BlockProps;
  layout?: BlockLayout;
  width?: string | null;
  children?: BatchBlockItem[];
}

export interface BatchAddResponse {
  ids: string[];
  topLevelIds: string[];
  map: Record<string, string>;
}

export interface FlattenedBlock {
  id: string;
  level: number;
}

export interface RenderRow {
  block: Block;
  level: number;
}

export interface BlocksStoreState {
  // data
  blocksById: Record<string, Block>;
  blocksByPage: Record<string, string[]>;
  childrenByParentId: Record<string, Record<string, string[]>>;
  expandedById: Record<string, boolean>;

  // selection
  currentBlockId: string | null;
  focusRequestId: FocusRequest | null;

  _contentTokens: Record<string, number>;
  _patchTokens?: Record<string, number>;

  // options menu
  optionsMenu: OptionsMenu;

  // anti-race fetch
  _fetchTokenByPage: Record<string, number>;

  // undo/redo
  _undoStack: UndoEntry[];
  _redoStack: UndoEntry[];
}

export type IdLike = string | number | null;

export type BaseCreateBlockPayload = {
  type?: string;
  content?: BlockContent;
};
