# Blocks Store Function Usage Analysis

## Overview

This document provides a comprehensive analysis of all functions in the `useBlocksStore` (blocks.js) and their usage across the codebase.

---

## 📊 Function Usage Summary

### ✅ WELL-USED FUNCTIONS

#### 1. **requestFocus(blockId, caret = 0)** - FREQUENTLY USED

**Purpose**: Request focus on a specific block with optional caret position
**Usage Count**: ~10+ locations
**Used in**:

- [BlockEditor.vue](frontend/src/views/BlockEditor.vue#L313) - Handle tab/shift+tab for indent/outdent
- [BlockEditor.vue](frontend/src/views/BlockEditor.vue#L417) - Request focus with -1 caret
- [useAppActions.ts](frontend/src/actions/useAppActions.ts#L38) - Move block tree to page and focus
- [blocks.actions.ts](frontend/src/actions/blocks.actions.ts#L18) - Insert block after and focus
- [usePageBlankClickFocus.js](frontend/src/composables/page/usePageBlankClickFocus.js#L60) - Focus on blank click
- [usePageBlankClickFocus.js](frontend/src/composables/page/usePageBlankClickFocus.js#L142) - Focus new block at root
- [usePageBlankClickFocus.js](frontend/src/composables/page/usePageBlankClickFocus.js#L156) - Focus newly created block

#### 2. **updateBlockContent(blockId, patch)** - FREQUENTLY USED

**Purpose**: Update block content with optimistic rendering and retry on error
**Usage Count**: ~5+ locations
**Used in**:

- [BlockEditor.vue](frontend/src/views/BlockEditor.vue#L257) - Update checkbox state
- [useBlockPersistence.js](frontend/src/composables/block/useBlockPersistence.js#L16) - Debounced save (Rich/Code)

#### 3. **updateBlockType(blockId, newType)** - FREQUENTLY USED

**Purpose**: Change block type (p, h1, code, callout, etc.) with auto-property adjustments
**Usage Count**: ~5+ locations
**Used in**:

- [blocks.actions.ts](frontend/src/actions/blocks.actions.ts#L79) - Set block type action
- [AppShell.vue](frontend/src/views/AppShell.vue#L692) - Update block type from global UI
- [PageView.vue](frontend/src/views/PageView.vue#L313) - Update current block type

#### 4. **deleteBlock(blockId, pageId)** - FREQUENTLY USED

**Purpose**: Delete block with optimistic UI update, hard resync on error
**Usage Count**: ~2+ locations
**Used in**:

- [blocks.actions.ts](frontend/src/actions/blocks.actions.ts#L73) - Delete block with confirmation dialog

#### 5. **addNewBlock(pageId, payload, blockId)** - FREQUENTLY USED

**Purpose**: Add new block after a specific block or at root with child adoption logic
**Usage Count**: ~5+ locations
**Used in**:

- [blocks.actions.ts](frontend/src/actions/blocks.actions.ts#L12) - Insert block after and focus
- [usePageBlankClickFocus.js](frontend/src/composables/page/usePageBlankClickFocus.js#L149) - Add block on blank click
- [usePageBlankClickFocus.js](frontend/src/composables/page/usePageBlankClickFocus.js#L175) - Add block with different config

#### 6. **indentBlock(pageId, blockId)** - FREQUENTLY USED

**Purpose**: Indent block (Tab key - make it child of previous sibling)
**Usage Count**: ~2+ locations
**Used in**:

- [BlockEditor.vue](frontend/src/views/BlockEditor.vue#L312) - Handle Tab key indent

#### 7. **outdentBlock(pageId, blockId)** - FREQUENTLY USED

**Purpose**: Outdent block (Shift+Tab - promote to parent level, adopts children)
**Usage Count**: ~2+ locations
**Used in**:

- [BlockEditor.vue](frontend/src/views/BlockEditor.vue#L311) - Handle Shift+Tab outdent

#### 8. **updateBlockStyle(blockId, stylePatch)** - FREQUENTLY USED

**Purpose**: Update block styling (text color, background color, font)
**Usage Count**: ~6+ locations
**Used in**:

- [blocks.actions.ts](frontend/src/actions/blocks.actions.ts#L83) - Set text color
- [blocks.actions.ts](frontend/src/actions/blocks.actions.ts#L87) - Set background color
- [blocks.actions.ts](frontend/src/actions/blocks.actions.ts#L91) - Set font
- [AppShell.vue](frontend/src/views/AppShell.vue#L669) - Update text/bg color
- [AppShell.vue](frontend/src/views/AppShell.vue#L679) - Update font style

#### 9. **setCurrentBlock(blockId)** - MODERATE USE

**Purpose**: Set the currently selected/active block
**Usage Count**: ~2+ locations
**Used in**:

- [useBlockFocus.js](frontend/src/composables/block/useBlockFocus.js#L13) - Set current block on focus

#### 10. **moveBlock(pageId, blockId, {parentId, position})** - MODERATE USE

**Purpose**: Move block with drag-and-drop (optimistic local, hard resync on error)
**Usage Count**: ~2+ locations
**Used in**:

- [PageView.vue](frontend/src/views/PageView.vue#L191) - Drag-drop move block

#### 11. **isExpanded(blockId)** - MODERATE USE

**Purpose**: Check if toggle/collapsible block is expanded
**Usage Count**: ~3+ locations
**Used in**:

- [BlockRow.vue](frontend/src/views/BlockRow.vue#L99) - Compute expanded state
- [PageView.vue](frontend/src/views/PageView.vue#L151) - Check block expansion

#### 12. **toggleExpandBlock(blockId)** - MODERATE USE

**Purpose**: Toggle block expansion state and persist
**Usage Count**: ~3+ locations
**Used in**:

- [BlockRow.vue](frontend/src/views/BlockRow.vue#L102) - Toggle expand on click
- [RecursiveDraggable.vue](frontend/src/components/draggableList/RecursiveDraggable.vue#L62) - Toggle on drag

#### 13. **expandBlock(blockId)** - MODERATE USE

**Purpose**: Expand a collapsed block
**Usage Count**: ~2+ locations
**Used in**:

- [PageView.vue](frontend/src/views/PageView.vue#L202) - Expand block during drop
- [RecursiveDraggable.vue](frontend/src/components/draggableList/RecursiveDraggable.vue#L62) - Expand during operation

#### 14. **updateBlockIcon(blockId, iconId)** - LIGHT USE

**Purpose**: Update block icon (for callouts, etc.)
**Usage Count**: ~1 location
**Used in**:

- [BlockEditor.vue](frontend/src/views/BlockEditor.vue#L236) - Update selected icon

#### 15. **duplicateBlockInPlace(pageId, blockId)** - LIGHT USE

**Purpose**: Duplicate entire block subtree
**Usage Count**: ~3+ locations
**Used in**:

- [blocks.actions.ts](frontend/src/actions/blocks.actions.ts#L38) - Duplicate block action
- [AppShell.vue](frontend/src/views/AppShell.vue#L519) - Global duplicate command
- [BlockMenuController.vue](frontend/src/components/BlockMenuController.vue#L519) - Menu duplicate option

#### 16. **transferSubtreeToPage()** - LIGHT USE

**Purpose**: Move entire block tree to different page
**Usage Count**: ~3+ locations
**Used in**:

- [blocks.actions.ts](frontend/src/actions/blocks.actions.ts#L28) - Move block tree to page action
- [AppShell.vue](frontend/src/views/AppShell.vue#L648) - Global move to page
- [BlockMenuController.vue](frontend/src/components/BlockMenuController.vue#L618) - Menu move option

#### 17. **isCircularMove(draggedId, targetParentId)** - LIGHT USE

**Purpose**: Check if move operation creates circular reference
**Usage Count**: ~1 location
**Used in**:

- [PageView.vue](frontend/src/views/PageView.vue#L180) - Validate drag-drop before move

#### 18. **patchBlockOptimistic(blockId, patch)** - LIGHT USE

**Purpose**: Patch multiple block properties with token-based race condition handling
**Usage Count**: ~1 location
**Used in**:

- [editor.actions.ts](frontend/src/actions/editor.actions.ts#L133) - Patch block during paste

#### 19. **batchAddBlocksAfter()** - LIGHT USE

**Purpose**: Batch create multiple blocks (e.g., paste multi-level structure)
**Usage Count**: ~1 location
**Used in**:

- [editor.actions.ts](frontend/src/actions/editor.actions.ts#L155) - Paste blocks with hierarchy

#### 20. **fetchBlocksForPage(pageId)** - INTERNAL/ERROR RECOVERY

**Purpose**: Fetch all blocks for a page (hard resync on errors)
**Usage Count**: Multiple (mostly internal error recovery)
**Used in**:

- Internally called on all operation errors for hard resync
- [pages.js](frontend/src/stores/pages.js#L436) - External call to get page blocks

#### 21. **renderRowsForPage(pageId)** - GETTER (Computed)

**Purpose**: Get flattened hierarchical block structure with levels
**Usage Count**: Used extensively in rendering logic
**Used in**:

- [pages.js](frontend/src/stores/pages.js#L436) - Get rows for page copy

#### 22. **blocksForPage(pageId)** - GETTER (Computed)

**Purpose**: Get all blocks for a page (simple list, not hierarchical)
**Usage Count**: Used in various components

#### 23. **currentBlock** - GETTER (Computed)

**Purpose**: Get currently selected block object
**Usage Count**: Multiple locations
**Used in**:

- [PageView.vue](frontend/src/views/PageView.vue#L313) - Access current block for operations

#### 24. **clearCurrentBlock()** - LIGHT USE

**Purpose**: Clear the currently selected block
**Usage Count**: ~1 location
**Used in**:

- [useBlockFocus.js](frontend/src/composables/block/useBlockFocus.js#L22) - Clear on blur

---

### ⚠️ UNUSED OR INTERNAL FUNCTIONS

#### **Not Used in Codebase**:

1. `clearFocusRequest()` - Defined but never called
2. `openOptionsMenu(blockId, anchorRect)` - Defined but never called
3. `closeOptionsMenu()` - Defined but never called
4. `setOptionsMenuAnchor(anchorEl)` - Defined but never called
5. `collapseAll()` - Defined but never called
6. `registerEditor(blockId, editorRef)` - Defined but never called
7. `unregisterEditor(blockId)` - Defined but never called
8. `getCurrentEditor()` - Defined but never called
9. `reconcileTempIds(map)` - Defined but never called (commented out in usage)
10. `applyDeleteLocal()` - Internal helper
11. `applyMoveLocal()` - Internal helper
12. `applyCreateLocal()` - Internal helper
13. `applyUpdateLocal()` - Internal helper
14. `applyTransactionLocal()` - Internal helper
15. `persistTransaction()` - Internal helper
16. `patchBlock()` - Internal helper
17. `ensurePageMap()` - Internal helper
18. `getKind()` - Internal helper
19. `hasRowAncestor()` - Internal helper
20. `sortSiblingsByPosition()` - Internal helper
21. `getParentKeyOf()` - Internal helper (unused getter)
22. `addNewBlockAfter()` - Internal helper (called by addNewBlock)
23. `addNewBlockAfterAdoptChildren()` - Internal helper
24. `addChildBlock()` - Defined but never called
25. `mapBatchItem()` - Internal helper
26. `buildNextProps()` - Internal helper

---

## 🎯 Common Patterns

### Pattern 1: Optimistic Updates with Error Recovery

```typescript
// Used by: moveBlock, indentBlock, outdentBlock, deleteBlock, updateBlockContent
// Pattern: Apply locally -> Persist -> Hard resync on error
await blocksStore.moveBlock(pageId, blockId, { parentId, position });
```

### Pattern 2: Content Update (Debounced)

```typescript
// Used in: useBlockPersistence
// Pattern: Debounce content changes with auto-save
await blocksStore.updateBlockContent(blockId, { json, text });
```

### Pattern 3: Focus Management

```typescript
// Used throughout: requestFocus at any operation requiring focus
blocksStore.requestFocus(blockId, caretPosition);
```

### Pattern 4: Styling Updates

```typescript
// Used in: Style menu, toolbar
await blocksStore.updateBlockStyle(blockId, { textColor, bgColor, font });
```

### Pattern 5: Hierarchy Modifications

```typescript
// Tab/Shift+Tab for indenting/outdenting
await blocksStore.indentBlock(pageId, blockId);
await blocksStore.outdentBlock(pageId, blockId);
```

---

## 📈 Statistics

- **Total Functions**: ~50
- **Frequently Used** (5+ usages): 8
- **Moderately Used** (2-4 usages): 8
- **Lightly Used** (1 usage): 8
- **Never Used/Internal**: 18+

---

## 🔧 Recommendations

### High Priority (Dead Code)

- **Consider removing**: `reconcileTempIds()`, `addChildBlock()`, editor registration functions (`registerEditor`, `unregisterEditor`, `getCurrentEditor`)
- **These appear to be legacy/planned features** not currently used

### Medium Priority (Review)

- **Menu functions** (`openOptionsMenu`, `closeOptionsMenu`, `setOptionsMenuAnchor`):
  - Check if this is legacy UI code that should be removed
  - Or if it's planned for future menu implementation

### Low Priority

- **Utility functions** that are internal helpers and don't need external removal

---

## 📝 Notes

- The store heavily uses **optimistic updates** pattern for smooth UX
- **Hard resync on errors** ensures data consistency
- **Token-based race condition handling** prevents stale updates from overwriting new data
- **Hierarchical tree structure** with parent/child relationships
- Uses `posBetween()` for fractional positioning (fractional indexing)
