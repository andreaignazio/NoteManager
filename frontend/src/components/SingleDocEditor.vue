<script setup>
import {
  ref,
  watch,
  computed,
  onBeforeUnmount,
  onMounted,
  nextTick,
} from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { TextSelection } from "prosemirror-state";
import { Fragment } from "prosemirror-model";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import Blockquote from "@tiptap/extension-blockquote";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { lowlight } from "lowlight/lib/common";
import Placeholder from "@tiptap/extension-placeholder";

import { useDocActions } from "@/actions/doc.actions";
import { useEditorRegistryStore } from "@/stores/editorRegistry";
import useDocStore from "@/stores/docstore";
import usePagesStore from "@/stores/pages";
import useCollaborationStore from "@/stores/collaboration";
import { useCommentsStore } from "@/stores/comments";
import DraggableItem from "@/editor/extensions/draggableItem";
import { createSimpleDragHandleExtension } from "@/editor/extensions/simpleDragHandle";
import { PasteSplitExtension } from "@/editor/extensions/pasteSplit";
import { posBetween } from "@/domain/position";

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import useAuthStore from "@/stores/auth";
import DocOutlineNav from "@/components/DocOutlineNav.vue";

const props = defineProps({
  pageId: { type: [String, Number], required: true },
});

const authStore = useAuthStore();

const WS_URL = import.meta.env.VITE_YJS_WS_URL || "ws://localhost:8000/ws/yjs";

const ydoc = new Y.Doc();
const providerRef = ref(null);
const awarenessRef = ref(null);
const roomId = computed(() => `page:${props.pageId}`);

const actions = useDocActions();
const editorReg = useEditorRegistryStore();
const docStore = useDocStore();
const pagesStore = usePagesStore();
const collabStore = useCollaborationStore();
const commentsStore = useCommentsStore();
const rootEl = ref(null);
const isLoading = ref(false);
const errorMsg = ref("");
const isInitializing = ref(false);
const hasSeededFromRest = ref(false);
let awarenessChangeHandler = null;

let saveTimer = 0;
const pendingContent = ref(null);
let yjsSaveTimer = 0;
const pendingYjsContent = ref(null);
let isReordering = false;
const isSyncSuspended = ref(false);
let lastAwarenessState = null;

const docKey = computed(() => `doc:${String(props.pageId)}`);

const pageRole = computed(() => {
  const page = pagesStore.pagesById?.[String(props.pageId)] ?? null;
  return page?.role ?? null;
});

const isReadOnly = computed(() => pageRole.value === "viewer");
const yjsEnabled = computed(() => !!providerRef.value);

watch(
  () => props.pageId,
  async (pageId) => {
    if (!pageId) return;
    await commentsStore.fetchThreadsForPage(pageId);
    commentsStore.connectRealtime(pageId, authStore.token);
  },
  { immediate: true },
);

const simpleDragHandleExtension = createSimpleDragHandleExtension({
  className: "doc-simple-handle",
  nested: {
    enabled: true,
    edgeDetection: "none",
    defaultRules: true,
    rules: [
      {
        id: "draggableItemOnly",
        evaluate: ({ node }) =>
          node?.type?.name === "draggableItem" ? 0 : 1000,
      },
    ],
  },
  computePositionConfig: {
    placement: "left-start",
  },
});

function colorFromId(id) {
  const palette = [
    "#22c55e",
    "#3b82f6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
  ];
  if (!id) return palette[0];
  const str = String(id);
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) % 997;
  }
  return palette[hash % palette.length];
}

function destroyProvider() {
  if (providerRef.value) {
    providerRef.value.destroy();
  }
  if (awarenessRef.value && awarenessChangeHandler) {
    awarenessRef.value.off("change", awarenessChangeHandler);
  }
  providerRef.value = null;
  awarenessRef.value = null;
  awarenessChangeHandler = null;
}

function pauseSyncForDrag() {
  if (!yjsEnabled.value || isSyncSuspended.value) return;
  isSyncSuspended.value = true;
  if (awarenessRef.value?.getLocalState) {
    lastAwarenessState = awarenessRef.value.getLocalState();
  }
  if (awarenessRef.value?.setLocalState) {
    awarenessRef.value.setLocalState(null);
  }
}

function resumeSyncForDrag() {
  if (!isSyncSuspended.value) return;
  isSyncSuspended.value = false;
  if (awarenessRef.value?.setLocalState) {
    if (lastAwarenessState) {
      awarenessRef.value.setLocalState(lastAwarenessState);
    } else {
      const user = authStore.user;
      awarenessRef.value.setLocalStateField("user", {
        id: user?.id ?? user?.username,
        name: user?.username ?? "Anonymous",
        color: colorFromId(user?.id ?? user?.username),
        readOnly: isReadOnly.value,
      });
    }
  }
  lastAwarenessState = null;
}

function syncPresenceFromAwareness() {
  const awareness = awarenessRef.value;
  if (!awareness) return;
  const states = awareness.getStates?.() ?? new Map();
  const users = [];
  states.forEach((state) => {
    const user = state?.user;
    if (!user) return;
    users.push({
      id: user.id ?? user.username,
      username: user.name ?? user.username ?? "Anonymous",
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
    });
  });
  if (props.pageId != null) {
    collabStore.setPresence(props.pageId, users);
  }
}

function setupProvider(pageId) {
  if (!pageId) return;
  destroyProvider();

  const token = authStore.token;
  const provider = new WebsocketProvider(
    WS_URL,
    `page:${pageId}`,
    ydoc,
    token ? { params: { token } } : undefined,
  );
  providerRef.value = provider;
  awarenessRef.value = provider.awareness;

  provider.on("sync", (isSynced) => {
    if (!isSynced) return;
    if (hasSeededFromRest.value) return;
    const fragment = ydoc.getXmlFragment("prosemirror");
    if (fragment && fragment.length > 0) {
      hasSeededFromRest.value = true;
      return;
    }
    seedFromRest(pageId);
  });

  const user = authStore.user;
  awarenessRef.value.setLocalStateField("user", {
    id: user?.id ?? user?.username,
    name: user?.username ?? "Anonymous",
    color: colorFromId(user?.id ?? user?.username),
    readOnly: isReadOnly.value,
  });

  awarenessChangeHandler = () => {
    syncPresenceFromAwareness();
  };
  awarenessRef.value.on("change", awarenessChangeHandler);
  syncPresenceFromAwareness();
}

function resetYdoc() {
  const fragment = ydoc.getXmlFragment("prosemirror");
  if (fragment?.length) {
    fragment.delete(0, fragment.length);
  }
}

async function seedFromRest(pageId) {
  if (hasSeededFromRest.value) return;
  isLoading.value = true;
  errorMsg.value = "";
  isInitializing.value = true;
  try {
    const doc = await actions.loadDoc(pageId);
    const content = normalizeDocContent(doc?.content ?? getFallbackDoc());
    editor.value?.commands.setContent(content, false);
  } catch (e) {
    console.warn("[SingleDocEditor] seed failed", e);
    const status = e?.response?.status;
    errorMsg.value = status === 403 ? "Access denied" : "Load failed";
  } finally {
    hasSeededFromRest.value = true;
    isInitializing.value = false;
    isLoading.value = false;
  }
}

function createSimpleNodeView(tagName, className, opts = {}) {
  return () => {
    const dom = document.createElement(tagName);
    dom.className = className;
    return { dom, contentDOM: dom };
  };
}

function findDraggableItemDepth($pos) {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "draggableItem") return d;
  }
  return 0;
}

function isAtStartOfDraggableItem($from, depth) {
  if (!$from || !depth) return false;
  if ($from.parentOffset !== 0) return false;
  for (let d = $from.depth; d > depth; d -= 1) {
    if ($from.index(d - 1) !== 0) return false;
  }
  return true;
}

function isAtEndOfDraggableItem($from, depth) {
  if (!$from || !depth) return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  for (let d = $from.depth; d > depth; d -= 1) {
    const node = $from.node(d);
    if ($from.index(d - 1) !== node.childCount) return false;
  }
  return true;
}

function normalizeItemId(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function normalizeItemPosition(value) {
  if (typeof value !== "string") return null;
  const str = value.trim();
  return str ? str : null;
}

function makeItemId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function ensureItemId(tr, pos, node) {
  const existing = normalizeItemId(node?.attrs?.id ?? null);
  if (existing) return existing;
  const nextId = makeItemId();
  tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: nextId });
  return nextId;
}

function findDraggableItemById(doc, id) {
  let found = null;
  doc.descendants((node, pos) => {
    if (node.type?.name !== "draggableItem") return true;
    const nodeId = normalizeItemId(node.attrs?.id ?? null);
    if (nodeId === id) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

function findDraggableItemByParent(doc, parentId) {
  const key = normalizeItemId(parentId);
  const out = [];
  doc.descendants((node, pos) => {
    if (node.type?.name !== "draggableItem") return true;
    const pid = normalizeItemId(node.attrs?.parentId ?? null);
    if (pid === key) out.push({ node, pos });
    return true;
  });
  return out;
}

function findPrevDraggableItem(doc, beforePos) {
  let prev = null;
  doc.descendants((node, pos) => {
    if (node.type?.name !== "draggableItem") return true;
    if (pos >= beforePos) return false;
    prev = { node, pos };
    return true;
  });
  return prev;
}

function isEmptyDraggableItem(node) {
  if (!node || node.type?.name !== "draggableItem") return false;
  const first = node.content?.firstChild ?? null;
  if (!first) return true;
  if ((first.textContent ?? "").trim()) return false;
  return !first.content || first.content.size === 0;
}

function deleteDraggableItemAtPos(ed, pos, node) {
  if (!ed || typeof pos !== "number" || !node) return false;
  const { state, view } = ed;
  const tr = state.tr.delete(pos, pos + node.nodeSize);
  if (!tr.docChanged) return false;
  const nextPos = Math.max(0, pos - 1);
  tr.setSelection(TextSelection.near(tr.doc.resolve(nextPos)));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function wouldCreateCycle(doc, currentId, candidateParentId) {
  if (!currentId || !candidateParentId) return false;
  if (String(currentId) === String(candidateParentId)) return true;
  let cursor = String(candidateParentId);
  const seen = new Set();
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const ref = findDraggableItemById(doc, cursor);
    const next = normalizeItemId(ref?.node?.attrs?.parentId ?? null);
    if (!next) return false;
    if (String(next) === String(currentId)) return true;
    cursor = String(next);
  }
  return false;
}

function indentDraggableItem(ed) {
  console.log("Indenting draggable item");
  const { state, view } = ed;
  const { $from } = state.selection;
  const depth = findDraggableItemDepth($from);
  console.log("Found depth:", depth);
  if (!depth) return false;

  const currentNode = $from.node(depth);
  const currentPos = $from.before(depth);
  const prevRef = findPrevDraggableItem(state.doc, currentPos);
  if (!prevRef?.node) return false;

  const tr = state.tr;
  const prevId = ensureItemId(tr, prevRef.pos, prevRef.node);
  const currentId = ensureItemId(tr, currentPos, currentNode);
  if (wouldCreateCycle(state.doc, currentId, prevId)) return false;

  if (normalizeItemId(currentNode.attrs?.parentId ?? null) === prevId) {
    return false;
  }

  const siblings = findDraggableItemByParent(state.doc, prevId);
  const lastSibling = siblings[siblings.length - 1] ?? null;
  const lastPos = lastSibling
    ? normalizeItemPosition(lastSibling.node.attrs?.position ?? null)
    : null;
  const nextPos = posBetween(lastPos, null);

  const nextAttrs = {
    ...currentNode.attrs,
    id: currentId,
    parentId: prevId,
    position: nextPos,
  };
  tr.setNodeMarkup(currentPos, undefined, nextAttrs);

  if (!tr.docChanged) return false;
  view.dispatch(tr.scrollIntoView());
  return true;
}

function outdentDraggableItem(ed) {
  const { state, view } = ed;
  const { $from } = state.selection;
  const depth = findDraggableItemDepth($from);
  if (!depth) return false;

  const currentNode = $from.node(depth);
  const currentPos = $from.before(depth);
  const currentParentId = normalizeItemId(currentNode.attrs?.parentId ?? null);
  if (!currentParentId) return false;

  const parentRef = findDraggableItemById(state.doc, currentParentId);
  const nextParentId = normalizeItemId(
    parentRef?.node?.attrs?.parentId ?? null,
  );

  const tr = state.tr;
  const currentId = ensureItemId(tr, currentPos, currentNode);

  const siblings = findDraggableItemByParent(state.doc, nextParentId ?? null);
  const parentIdx = siblings.findIndex((s) => s.pos === parentRef?.pos);
  const parentPos = normalizeItemPosition(
    parentRef?.node?.attrs?.position ?? null,
  );
  const nextSibling = parentIdx >= 0 ? siblings[parentIdx + 1] : null;
  const nextSiblingPos = nextSibling
    ? normalizeItemPosition(nextSibling.node.attrs?.position ?? null)
    : null;
  const nextPos = posBetween(parentPos, nextSiblingPos);

  const nextAttrs = {
    ...currentNode.attrs,
    id: currentId,
    parentId: nextParentId ?? null,
    position: nextPos,
  };
  tr.setNodeMarkup(currentPos, undefined, nextAttrs);

  if (!tr.docChanged) return false;
  view.dispatch(tr.scrollIntoView());
  return true;
}

function mergeDraggableItemWithPrev(ed) {
  const { state, view } = ed;
  const { selection } = state;
  if (!selection?.empty) return false;
  const { $from } = selection;
  const depth = findDraggableItemDepth($from);
  if (!depth) return false;

  const currentNode = $from.node(depth);
  const currentPos = $from.before(depth);
  const currentId = normalizeItemId(currentNode.attrs?.id ?? null);
  const currentParentId = normalizeItemId(currentNode.attrs?.parentId ?? null);

  if (currentId) {
    const children = findDraggableItemByParent(state.doc, currentId);
    //if (children.length) return false;
  }

  const prevRef = findPrevDraggableItem(state.doc, currentPos);
  if (!prevRef?.node) return false;

  const prevNode = prevRef.node;
  const prevPos = prevRef.pos;
  const prevParentId = normalizeItemId(prevNode.attrs?.parentId ?? null);

  if (prevParentId !== currentParentId) return false;

  const prevBlock = prevNode.content.firstChild;
  const currentBlock = currentNode.content.firstChild;
  if (!prevBlock || !currentBlock) return false;

  const isPrevCode =
    prevNode.attrs?.blockType === "code" ||
    prevBlock.type?.name === "codeBlock";
  if (isPrevCode) return false;

  const prevInlineSize = prevBlock.content.size;
  const currentInlineSize = currentBlock.content.size;
  const shouldInsertSpace = prevInlineSize > 0 && currentInlineSize > 0;
  const spaceNode = shouldInsertSpace ? state.schema.text(" ") : null;
  const mergedInline = spaceNode
    ? prevBlock.content
        .append(Fragment.from(spaceNode))
        .append(currentBlock.content)
    : prevBlock.content.append(currentBlock.content);
  if (!prevBlock.type.validContent(mergedInline)) return false;

  const mergedBlock = prevBlock.type.create(
    prevBlock.attrs,
    mergedInline,
    prevBlock.marks,
  );

  const nextContent = [mergedBlock];
  for (let i = 1; i < prevNode.content.childCount; i += 1) {
    nextContent.push(prevNode.content.child(i));
  }

  const mergedNode = prevNode.type.create(
    prevNode.attrs,
    Fragment.fromArray(nextContent),
    prevNode.marks,
  );

  const tr = state.tr;
  tr.replaceWith(prevPos, prevPos + prevNode.nodeSize, mergedNode);

  const mappedCurrentPos = tr.mapping.map(currentPos);
  tr.delete(mappedCurrentPos, mappedCurrentPos + currentNode.nodeSize);

  const mappedPrevPos = tr.mapping.map(prevPos);
  const joinOffset = prevInlineSize + (shouldInsertSpace ? 1 : 0);
  const selectionPos = mappedPrevPos + 2 + joinOffset;
  tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)));

  view.dispatch(tr.scrollIntoView());
  return true;
}

function splitDraggableItemAtSelection(ed) {
  const { state, view } = ed;
  const { selection } = state;
  if (!selection?.empty) return false;
  const { $from } = selection;
  const depth = findDraggableItemDepth($from);
  if (!depth) return false;

  const node = $from.node(depth);
  const pos = $from.before(depth);
  const offset = selection.from - (pos + 1);
  if (offset < 0 || offset > node.content.size) return false;

  const ensureContent = (frag) =>
    frag && frag.size
      ? frag
      : Fragment.from(state.schema.nodes.paragraph.create());

  const beforeContent = ensureContent(node.content.cut(0, offset));
  const afterContent = ensureContent(node.content.cut(offset));

  const currentId = normalizeItemId(node.attrs?.id ?? null) ?? makeItemId();
  const parentId = normalizeItemId(node.attrs?.parentId ?? null);
  const currentPosition = normalizeItemPosition(node.attrs?.position ?? null);

  const siblings = findDraggableItemByParent(state.doc, parentId ?? null);
  const currentIdx = siblings.findIndex((s) => s.pos === pos);
  const nextSibling = currentIdx >= 0 ? siblings[currentIdx + 1] : null;
  const nextSiblingPos = nextSibling
    ? normalizeItemPosition(nextSibling.node.attrs?.position ?? null)
    : null;
  const afterPosition = posBetween(currentPosition, nextSiblingPos);

  const beforeAttrs = {
    ...node.attrs,
    id: currentId,
    parentId: parentId ?? null,
    position: currentPosition ?? posBetween(null, afterPosition),
  };
  const afterAttrs = {
    ...node.attrs,
    id: makeItemId(),
    parentId: parentId ?? null,
    position: afterPosition,
  };

  if (node?.attrs?.blockType === "todo") {
    afterAttrs.todoChecked = false;
  }

  const beforeNode = node.type.create(beforeAttrs, beforeContent);
  const afterNode = node.type.create(afterAttrs, afterContent);

  const tr = state.tr.replaceWith(pos, pos + node.nodeSize, beforeNode);
  const insertPos = pos + beforeNode.nodeSize;
  tr.insert(insertPos, afterNode);

  const selectionPos = insertPos + 1;
  tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function insertDraggableItemAfterSelection(ed) {
  const { state, view } = ed;
  const { $from } = state.selection;
  const depth = findDraggableItemDepth($from);
  if (!depth) return false;

  const currentNode = $from.node(depth);
  const currentPos = $from.before(depth);
  const insertPos = currentPos + currentNode.nodeSize;
  const listType = currentNode.attrs?.listType ?? null;

  const parentId = normalizeItemId(currentNode.attrs?.parentId ?? null);
  const currentPosition = normalizeItemPosition(currentNode.attrs?.position);
  const siblings = findDraggableItemByParent(state.doc, parentId ?? null);
  const currentIdx = siblings.findIndex((s) => s.pos === currentPos);
  const nextSibling = currentIdx >= 0 ? siblings[currentIdx + 1] : null;
  const nextSiblingPos = nextSibling
    ? normalizeItemPosition(nextSibling.node.attrs?.position ?? null)
    : null;
  const nextPosition = posBetween(currentPosition, nextSiblingPos);

  const attrs = listType ? { listType, listStart: null } : {};
  const newNode = state.schema.nodes.draggableItem.create(
    {
      ...attrs,
      id: makeItemId(),
      parentId: parentId ?? null,
      position: nextPosition,
    },
    [state.schema.nodes.paragraph.create()],
  );

  const tr = state.tr.insert(insertPos, newNode);
  if (!tr.docChanged) return false;
  view.dispatch(tr.scrollIntoView());

  const nextPos = insertPos + 1;
  ed.commands?.setTextSelection?.(nextPos + 1);
  return true;
}

function findLastDraggableItem(doc) {
  let last = null;
  doc.descendants((node, pos) => {
    if (node.type?.name !== "draggableItem") return true;
    last = { node, pos };
    return true;
  });
  return last;
}

function isDraggableItemEmpty(node) {
  if (!node) return false;
  const text = node.textContent ?? "";
  return text.trim().length === 0;
}

function focusDraggableItemAtPos(ed, pos) {
  const { state, view } = ed;
  const maxPos = state.doc.content.size;
  const targetPos = Math.min(pos + 2, maxPos);
  const tr = state.tr.setSelection(
    TextSelection.near(state.doc.resolve(targetPos)),
  );
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function appendRootDraggableItemAndFocus(ed) {
  const { state, view } = ed;
  const roots = findDraggableItemByParent(state.doc, null);
  const lastRoot = roots.length ? roots[roots.length - 1] : null;
  const lastPos = lastRoot
    ? normalizeItemPosition(lastRoot.node.attrs?.position ?? null)
    : null;
  const nextPosition = posBetween(lastPos, null);

  const newNode = state.schema.nodes.draggableItem.create(
    {
      id: makeItemId(),
      parentId: null,
      position: nextPosition,
    },
    [state.schema.nodes.paragraph.create()],
  );

  const insertPos = lastRoot
    ? lastRoot.pos + lastRoot.node.nodeSize
    : state.doc.content.size;
  const tr = state.tr.insert(insertPos, newNode);
  if (!tr.docChanged) return false;

  const selectionPos = insertPos + 2;
  tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function collectDraggableItemRefs(doc) {
  const refs = [];
  doc.descendants((node, pos) => {
    if (node.type?.name !== "draggableItem") return true;
    refs.push({ node, pos });
    return true;
  });
  return refs;
}

function closestItemIndexByY(itemEls, clientY) {
  let bestIdx = -1;
  let bestDistance = Infinity;
  let bestBottom = -Infinity;
  let lastIdxByBottom = -1;

  itemEls.forEach((el, idx) => {
    const rect = el.getBoundingClientRect();
    const center = (rect.top + rect.bottom) / 2;
    const distance = Math.abs(clientY - center);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIdx = idx;
    }
    if (rect.bottom > bestBottom) {
      bestBottom = rect.bottom;
      lastIdxByBottom = idx;
    }
  });

  if (bestIdx === -1) return null;
  if (clientY > bestBottom) {
    return { mode: "below", lastIdx: lastIdxByBottom, lastBottom: bestBottom };
  }
  return { mode: "nearest", idx: bestIdx };
}

function handleBlankPointerDown(event) {
  handleBlankClick(event, {
    allowOutside: true,
    scopeEl: event?.currentTarget ?? null,
  });
}

function handleGlobalPointerDown(event) {
  handleBlankClick(event, { allowOutside: true, scopeEl: null });
}

function handleBlankClick(event, { allowOutside, scopeEl }) {
  if (isReadOnly.value) return;
  if (!event || event.button !== 0) return;
  const ed = editor.value;
  if (!ed) return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest("button, a, input, textarea")) return;
  if (target.closest(".doc-error")) return;

  const editorEl = ed.view?.dom;
  if (!editorEl) return;
  if (allowOutside) {
    if (scopeEl && !scopeEl.contains(target)) return;
    const docRow = rootEl.value?.closest(".doc-row") ?? null;
    if (!scopeEl && (!docRow || !docRow.contains(target))) return;
    if (editorEl.contains(target)) return;
  } else if (!editorEl.contains(target)) {
    return;
  }

  if (target.closest(".doc-item")) return;

  const itemEls = Array.from(editorEl.querySelectorAll(".doc-item"));
  if (!itemEls.length) {
    event.preventDefault();
    appendRootDraggableItemAndFocus(ed);
    return;
  }

  const refs = collectDraggableItemRefs(ed.state.doc);
  if (!refs.length) {
    event.preventDefault();
    appendRootDraggableItemAndFocus(ed);
    return;
  }

  const hit = closestItemIndexByY(itemEls, event.clientY);
  if (hit?.mode === "nearest") {
    const idx = Math.min(hit.idx, refs.length - 1);
    event.preventDefault();
    focusDraggableItemAtPos(ed, refs[idx].pos);
    return;
  }

  const lastEl = itemEls[itemEls.length - 1];
  const lastRect = lastEl.getBoundingClientRect();
  const editorRect = editorEl.getBoundingClientRect();
  const threshold = allowOutside
    ? Math.max(lastRect.bottom, editorRect.bottom)
    : lastRect.bottom;

  if (event.clientY >= threshold - 4) {
    event.preventDefault();
    const lastRef = findLastDraggableItem(ed.state.doc);
    if (lastRef?.node && isDraggableItemEmpty(lastRef.node)) {
      focusDraggableItemAtPos(ed, lastRef.pos);
      return;
    }
    appendRootDraggableItemAndFocus(ed);
  }
}

const CustomParagraph = Paragraph.extend({
  addNodeView() {
    return createSimpleNodeView("p", "doc-node doc-node--paragraph", {});
  },
});

const CustomHeading = Heading.extend({
  addNodeView() {
    return ({ node }) => {
      const level = node.attrs?.level ?? 1;
      const tag = `h${Math.min(6, Math.max(1, Number(level) || 1))}`;
      return createSimpleNodeView(tag, "doc-node doc-node--heading", {})();
    };
  },
});

const CustomBlockquote = Blockquote.extend({
  addNodeView() {
    return createSimpleNodeView(
      "blockquote",
      "doc-node doc-node--blockquote",
      {},
    );
  },
});

const CustomCodeBlock = CodeBlockLowlight.configure({
  lowlight,
  HTMLAttributes: {
    class: "doc-node doc-node--code",
  },
});

const CustomHighlight = Highlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      color: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-color") ||
          element.style?.backgroundColor ||
          null,
        renderHTML: (attrs) => {
          if (!attrs.color) return {};
          return {
            "data-color": attrs.color,
            style: `background-color: ${attrs.color}`,
          };
        },
      },
    };
  },
});

const editor = useEditor({
  extensions: [
    Collaboration.configure({
      document: ydoc,
    }),
    ...(providerRef.value && !isReadOnly.value
      ? [
          CollaborationCaret.configure({
            provider: providerRef.value,
            user: {
              name: authStore.user?.username ?? "Anonymous",
              color: colorFromId(
                authStore.user?.id ?? authStore.user?.username,
              ),
            },
          }),
        ]
      : []),
    StarterKit.configure({
      paragraph: false,
      heading: false,
      blockquote: false,
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      taskList: false,
      taskItem: false,
      link: false,
    }),
    CustomHighlight.configure({
      multicolor: true,
    }),
    Link.configure({
      openOnClick: false,
      linkOnPaste: true,
      autolink: false,
    }),
    DraggableItem,
    CustomParagraph,
    CustomHeading,
    CustomBlockquote,
    CustomCodeBlock,
    simpleDragHandleExtension,
    PasteSplitExtension,
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (!node) return "Type here…";
        if (node.type?.name === "heading") return "Heading";
        if (node.type?.name === "blockquote") return "Quote";
        if (node.type?.name === "codeBlock") return "Code";
        return "Type here…";
      },
      emptyEditorClass: "is-editor-empty",
      emptyNodeClass: "is-empty-node",
      showOnlyCurrent: true,
      showOnlyWhenEditable: true,
    }),
  ],
  content: null,
  editable: () => !isReadOnly.value,
  editorProps: {
    attributes: {
      class: "single-doc-editor-content",
      "data-doc-editor": "true",
      "data-doc-page-id": String(props.pageId),
    },
    handleDOMEvents: {
      drop: (view, event) => {
        // Ensure drag and drop MOVES nodes instead of copying them
        if (view.dragging) {
          view.dragging.move = true;
        }
        return false;
      },
    },
    handleKeyDown: (_view, event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        const ed = editor.value;
        if (!ed) return false;
        const { selection } = ed.state;
        if (!selection?.empty) return false;
        const { $from } = selection;
        const depth = findDraggableItemDepth($from);
        if (!depth) return false;
        const currentPos = $from.before(depth);
        const lastRef = findLastDraggableItem(ed.state.doc);
        if (lastRef?.pos === currentPos) {
          if (
            event.key === "ArrowDown" ||
            (event.key === "ArrowRight" && isAtEndOfDraggableItem($from, depth))
          ) {
            event.preventDefault();
            return true;
          }
        }
      }
      if (event.key === "Enter" && !event.shiftKey) {
        const ed = editor.value;
        if (!ed) return false;
        if (ed.isActive?.("codeBlock")) return false;
        event.preventDefault();
        return (
          splitDraggableItemAtSelection(ed) ||
          insertDraggableItemAfterSelection(ed)
        );
      }
      if (event.key === "Backspace") {
        const ed = editor.value;
        if (!ed) return false;
        if (ed.isActive?.("codeBlock")) return false;
        const { selection } = ed.state;
        if (!selection?.empty) return false;
        const { $from } = selection;
        const depth = findDraggableItemDepth($from);
        if (!depth) return false;
        if (isAtStartOfDraggableItem($from, depth)) {
          const currentNode = $from.node(depth);
          const currentPos = $from.before(depth);
          const currentParentId = normalizeItemId(
            currentNode.attrs?.parentId ?? null,
          );
          const prevRef = findPrevDraggableItem(ed.state.doc, currentPos);
          const prevParentId = normalizeItemId(
            prevRef?.node?.attrs?.parentId ?? null,
          );
          event.preventDefault();
          if (!prevRef?.node && isEmptyDraggableItem(currentNode)) {
            return deleteDraggableItemAtPos(ed, currentPos, currentNode);
          }
          if (currentParentId && prevParentId !== currentParentId) {
            outdentDraggableItem(ed);
            return true;
          }
          mergeDraggableItemWithPrev(ed);
          return true;
        }
        return false;
      }
      if (event.key !== "Tab") return false;

      event.preventDefault();
      const ed = editor.value;
      if (!ed) return false;

      if (event.shiftKey) {
        return outdentDraggableItem(ed);
      }

      return indentDraggableItem(ed);
    },
  },
  onUpdate: ({ editor }) => {
    if (isInitializing.value) return;
    if (isReordering) {
      isReordering = false;
      return;
    }
    if (yjsEnabled.value) {
      if (isSyncSuspended.value) return;
      scheduleYjsSave(editor.getJSON());
      return;
    }
    const orderedJson = normalizeDocContent(editor.getJSON());
    const orderedNode = editor.schema.nodeFromJSON(orderedJson);
    if (!orderedNode.eq(editor.state.doc)) {
      isReordering = true;
      const tr = editor.state.tr.replaceWith(
        0,
        editor.state.doc.content.size,
        orderedNode.content,
      );
      editor.view.dispatch(tr);
      return;
    }
    scheduleSave(orderedJson);
  },
  onSelectionUpdate: ({ editor }) => {
    const docNodeId = getCurrentDocNodeId(editor);
    docStore.setCurrentDocNodeId(docNodeId);
  },
  onFocus: () => {
    docStore.setCurrentDocKey(docKey.value);
    const docNodeId = getCurrentDocNodeId(editor.value);
    docStore.setCurrentDocNodeId(docNodeId);
  },
  onBlur: () => {
    if (docStore.currentDocKey === docKey.value) {
      docStore.clearCurrentDoc();
    }
  },
});

watch(isReadOnly, (next) => {
  const ed = editor.value;
  if (!ed) return;
  ed.setEditable(!next);
  if (awarenessRef.value) {
    if (next) {
      awarenessRef.value.setLocalState(null);
    } else {
      const user = authStore.user;
      awarenessRef.value.setLocalStateField("user", {
        id: user?.id ?? user?.username,
        name: user?.username ?? "Anonymous",
        color: colorFromId(user?.id ?? user?.username),
      });
    }
    syncPresenceFromAwareness();
  }
});

function blockTypeFromNode(node) {
  if (!node) return "p";
  if (node.type === "heading") {
    const level = Number(node.attrs?.level ?? 1);
    if (level === 1) return "h1";
    if (level === 2) return "h2";
    return "h3";
  }
  if (node.type === "blockquote") return "quote";
  if (node.type === "codeBlock") return "code";
  if (node.type === "horizontalRule") return "divider";
  return "p";
}

function wrapInDraggableItem(node, extraAttrs = {}) {
  if (!node || node.type === "draggableItem") return node;
  const blockType = blockTypeFromNode(node);
  const attrs = {
    blockType,
    ...extraAttrs,
  };
  return { type: "draggableItem", attrs, content: [node] };
}

function getCurrentDocNodeId(ed) {
  try {
    if (!ed) return null;
    const { $from } = ed.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === "draggableItem") {
        const itemId = node?.attrs?.id != null ? String(node.attrs.id) : null;
        if (itemId) return itemId;
        const pos = $from.before(d);
        return `docnode:${pos}`;
      }
    }
  } catch {}
  return null;
}

function normalizeBlockChildren(children = []) {
  const next = [];
  children.forEach((child) => {
    if (!child) return;
    if (child.type === "bulletList" || child.type === "orderedList") {
      next.push(...normalizeNodeToDraggableItems(child));
      return;
    }
    if (child.type === "draggableItem") {
      next.push(child);
      return;
    }
    if (Array.isArray(child.content)) {
      next.push({ ...child, content: normalizeBlockChildren(child.content) });
      return;
    }
    next.push(child);
  });
  return next;
}

function splitInlineByHardBreak(content = []) {
  const segments = [];
  let current = [];

  content.forEach((node) => {
    if (!node) return;
    if (node.type === "hardBreak") {
      segments.push(current);
      current = [];
      return;
    }
    current.push(node);
  });

  segments.push(current);
  return segments;
}

function splitParagraphByHardBreak(node) {
  if (!node || node.type !== "paragraph") return [node];
  const content = Array.isArray(node.content) ? node.content : [];
  const segments = splitInlineByHardBreak(content).filter((seg) => seg.length);
  if (!segments.length) return [node];
  return segments.map((seg) => ({ type: "paragraph", content: seg }));
}

function splitDraggableItemContent(node) {
  const attrs = node?.attrs ?? {};
  const content = normalizeBlockChildren(node?.content || []);

  const items = [];
  let currentBlock = null;
  let children = [];

  content.forEach((child) => {
    if (!child) return;
    if (child.type === "draggableItem") {
      children.push(child);
      return;
    }

    const blocks = splitParagraphByHardBreak(child);
    blocks.forEach((block) => {
      if (!currentBlock) {
        currentBlock = block;
        return;
      }

      items.push({
        type: "draggableItem",
        attrs,
        content: [currentBlock, ...children],
      });
      currentBlock = block;
      children = [];
    });
  });

  if (!currentBlock) {
    currentBlock = { type: "paragraph" };
  }

  items.push({
    type: "draggableItem",
    attrs,
    content: [currentBlock, ...children],
  });

  return items;
}

function normalizeListNode(listNode) {
  const listType = listNode.type === "bulletList" ? "bullet" : "ordered";
  const start = Number(listNode.attrs?.start ?? 1);
  const items = Array.isArray(listNode.content) ? listNode.content : [];
  const normalized = [];

  const buildListItem = (item, idx) => {
    const raw = Array.isArray(item.content) ? item.content : [];
    const blockNodes = [];
    const childItems = [];

    raw.forEach((child) => {
      if (!child) return;
      if (child.type === "bulletList" || child.type === "orderedList") {
        childItems.push(...normalizeListNode(child));
        return;
      }
      if (child.type === "draggableItem") {
        childItems.push(child);
        return;
      }
      if (Array.isArray(child.content)) {
        blockNodes.push({
          ...child,
          content: normalizeBlockChildren(child.content),
        });
        return;
      }
      blockNodes.push(child);
    });

    const blocksExpanded = blockNodes
      .map((node) => splitParagraphByHardBreak(node))
      .flat();
    const baseBlock = blocksExpanded.shift() ?? { type: "paragraph" };
    const extraChildren = blocksExpanded
      .map((node) => wrapInDraggableItem(node))
      .filter(Boolean);

    const attrs = {
      listType,
      blockType: blockTypeFromNode(baseBlock),
    };
    if (listType === "ordered" && idx === 0 && start !== 1) {
      attrs.listStart = start;
    }

    return {
      type: "draggableItem",
      attrs,
      content: [baseBlock, ...childItems, ...extraChildren],
    };
  };

  items.forEach((item, idx) => {
    if (!item || item.type !== "listItem") return;
    normalized.push(buildListItem(item, idx));
  });
  return normalized;
}

function normalizeNodeToDraggableItems(node) {
  if (!node) return [];
  if (node.type === "draggableItem") {
    return splitDraggableItemContent(node);
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    return normalizeListNode(node);
  }
  const content = normalizeBlockChildren(node.content || []);
  const normalizedNode = node.content ? { ...node, content } : node;
  return [wrapInDraggableItem(normalizedNode)];
}

function normalizeDocContent(content) {
  if (!content || content.type !== "doc") return getFallbackDoc();
  const children = Array.isArray(content.content) ? content.content : [];
  const normalized = [];
  children.forEach((node) => {
    normalized.push(...normalizeNodeToDraggableItems(node));
  });
  if (!normalized.length) {
    normalized.push(wrapInDraggableItem({ type: "paragraph" }));
  }
  const fixed = normalizeDraggableItemIds(normalized);
  return { ...content, content: flatListFromParentId(fixed) };
}

function normalizeDraggableItemIds(nodes) {
  const used = new Set();
  const remapLatest = new Map();

  const fixed = nodes.map((node) => {
    if (!node || node.type !== "draggableItem") return node;
    const attrs = { ...(node.attrs ?? {}) };

    let id = normalizeItemId(attrs.id);
    if (!id) id = makeItemId();
    if (used.has(id)) {
      const newId = makeItemId();
      remapLatest.set(id, newId);
      id = newId;
    } else {
      remapLatest.set(id, id);
    }
    used.add(id);

    let parentId = normalizeItemId(attrs.parentId ?? null);
    if (parentId && remapLatest.has(parentId)) {
      parentId = remapLatest.get(parentId);
    }
    if (parentId === id) parentId = null;

    return {
      ...node,
      attrs: {
        ...attrs,
        id,
        parentId: parentId ?? null,
      },
    };
  });

  const grouped = new Map();
  fixed.forEach((node) => {
    if (!node || node.type !== "draggableItem") return;
    const pid = normalizeItemId(node.attrs?.parentId ?? null) ?? "__root__";
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid).push(node);
  });

  const isPosBefore = (a, b) => {
    if (!a || !b) return false;
    return String(a) < String(b);
  };

  grouped.forEach((group) => {
    let prev = null;
    group.forEach((node) => {
      const attrs = { ...(node.attrs ?? {}) };
      let position = normalizeItemPosition(attrs.position);
      if (!position || (prev && !isPosBefore(prev, position))) {
        position = posBetween(prev, null);
        node.attrs = { ...attrs, position };
      }
      prev = position;
    });
  });

  return fixed;
}

function flatListFromParentId(nodes) {
  const items = nodes.map((node, index) => ({ node, index }));
  const byId = new Map();
  items.forEach((item) => {
    if (!item.node || item.node.type !== "draggableItem") return;
    const id = normalizeItemId(item.node.attrs?.id ?? null);
    if (id) byId.set(id, item);
  });

  const childrenByParent = new Map();
  items.forEach((item) => {
    if (!item.node || item.node.type !== "draggableItem") return;
    const id = normalizeItemId(item.node.attrs?.id ?? null);
    let parentId = normalizeItemId(item.node.attrs?.parentId ?? null);
    if (!parentId || !byId.has(parentId) || parentId === id) {
      parentId = "__root__";
    }
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(item);
  });

  const compare = (a, b) => {
    const pa = normalizeItemPosition(a.node.attrs?.position ?? null);
    const pb = normalizeItemPosition(b.node.attrs?.position ?? null);
    if (pa && pb && pa !== pb) return pa < pb ? -1 : 1;
    if (pa && !pb) return -1;
    if (!pa && pb) return 1;
    return a.index - b.index;
  };

  const ordered = [];
  const visited = new Set();

  const visit = (item, stack) => {
    const id = normalizeItemId(item.node.attrs?.id ?? null);
    if (id && stack.has(id)) return;
    if (id && visited.has(id)) return;
    if (id) stack.add(id);
    ordered.push(item.node);
    if (id) visited.add(id);

    const kids = childrenByParent.get(id) ?? [];
    kids.sort(compare);
    kids.forEach((kid) => visit(kid, new Set(stack)));
  };

  const roots = childrenByParent.get("__root__") ?? [];
  roots.sort(compare);
  roots.forEach((root) => visit(root, new Set()));

  items.forEach((item) => {
    if (!item.node || item.node.type !== "draggableItem") {
      ordered.push(item.node);
      return;
    }
    const id = normalizeItemId(item.node.attrs?.id ?? null);
    if (id && !visited.has(id)) ordered.push(item.node);
  });

  return ordered;
}

function getFallbackDoc() {
  return {
    type: "doc",
    content: [wrapInDraggableItem({ type: "paragraph" })],
  };
}

function scheduleSave(content) {
  if (isReadOnly.value || yjsEnabled.value) return;
  const normalized = normalizeDocContent(content ?? {});
  pendingContent.value = normalized ?? {};
  if (saveTimer) window.clearTimeout(saveTimer);
  docStore.setSaving(props.pageId, true);
  saveTimer = window.setTimeout(async () => {
    try {
      await actions.saveDocContent(props.pageId, pendingContent.value ?? {});
      errorMsg.value = "";
    } catch (e) {
      console.warn("[SingleDocEditor] save failed", e);
      const status = e?.response?.status;
      errorMsg.value = status === 403 ? "Access denied" : "Save failed";
    } finally {
      docStore.setSaving(props.pageId, false);
    }
  }, 500);
}

function scheduleYjsSave(content) {
  if (isReadOnly.value) return;
  const normalized = normalizeDocContent(content ?? {});
  pendingYjsContent.value = normalized ?? {};
  if (yjsSaveTimer) window.clearTimeout(yjsSaveTimer);
  docStore.setSaving(props.pageId, true);
  yjsSaveTimer = window.setTimeout(async () => {
    try {
      await actions.saveDocContent(props.pageId, pendingYjsContent.value ?? {});
      errorMsg.value = "";
    } catch (e) {
      console.warn("[SingleDocEditor] yjs save failed", e);
      const status = e?.response?.status;
      errorMsg.value = status === 403 ? "Access denied" : "Save failed";
    } finally {
      docStore.setSaving(props.pageId, false);
    }
  }, 800);
}

const handleYdocUpdate = () => {
  if (!yjsEnabled.value) return;
  if (isInitializing.value) return;
  if (isReadOnly.value) return;
  if (isSyncSuspended.value) return;
  const fragment = ydoc.getXmlFragment("prosemirror");
  if (!fragment || fragment.length === 0) return;
  const ed = editor.value;
  if (!ed) return;
  scheduleYjsSave(ed.getJSON());
};

ydoc.on("update", handleYdocUpdate);

async function loadDoc(pageId) {
  isLoading.value = true;
  errorMsg.value = "";
  isInitializing.value = true;

  const fragment = ydoc.getXmlFragment("prosemirror");
  if (fragment?.length === 0) {
    try {
      const doc = await actions.loadDoc(pageId);
      const content = normalizeDocContent(doc?.content ?? getFallbackDoc());
      editor.value?.commands.setContent(content, false);
    } catch (e) {
      console.warn("[SingleDocEditor] load failed", e);
      const status = e?.response?.status;
      errorMsg.value = status === 403 ? "Access denied" : "Load failed";
    } finally {
      isInitializing.value = false;
      isLoading.value = false;
    }
  } else {
    isInitializing.value = false;
    isLoading.value = false;
  }
}

watch(
  () => props.pageId,
  (val, prevVal) => {
    if (prevVal) {
      docStore.setSaving(prevVal, false);
    }
    if (!val) return;
    destroyProvider();
    resetYdoc();
    hasSeededFromRest.value = false;
    setupProvider(String(val));
    if (!yjsEnabled.value) {
      loadDoc(String(val));
    }
  },
  { immediate: true },
);

watch(
  () => [docKey.value, editor.value],
  ([nextKey, nextEditor], prev) => {
    const [prevKey] = prev ?? [];
    if (prevKey && prevKey !== nextKey) {
      editorReg.registerEditor(prevKey, null);
      editorReg.registerEditor(String(props.pageId), null);
    }
    if (nextEditor) {
      editorReg.registerEditor(nextKey, nextEditor);
      if (props.pageId != null) {
        editorReg.registerEditor(String(props.pageId), nextEditor);
      }
    }
  },
  { immediate: true },
);

watch(
  () => docKey.value,
  (nextKey, prevKey) => {
    if (docStore.currentDocKey === prevKey) {
      docStore.setCurrentDocKey(nextKey);
    }
  },
);

onBeforeUnmount(() => {
  commentsStore.disconnectRealtime();
  window.removeEventListener("doc-sync-pause", handleSyncPause);
  window.removeEventListener("doc-sync-resume", handleSyncResume);
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  if (saveTimer) window.clearTimeout(saveTimer);
  if (yjsSaveTimer) window.clearTimeout(yjsSaveTimer);
  docStore.setSaving(props.pageId, false);
  editorReg.registerEditor(docKey.value, null);
  if (props.pageId != null) {
    editorReg.registerEditor(String(props.pageId), null);
  }
  if (docStore.currentDocKey === docKey.value) {
    docStore.clearCurrentDoc();
  }
  editor.value?.destroy();
  destroyProvider();
  ydoc.off("update", handleYdocUpdate);
  ydoc.destroy();
});

function handleSyncPause(event) {
  const pageId = event?.detail?.pageId ?? null;
  if (String(pageId ?? "") !== String(props.pageId)) return;
  pauseSyncForDrag();
}

function handleSyncResume(event) {
  const pageId = event?.detail?.pageId ?? null;
  if (String(pageId ?? "") !== String(props.pageId)) return;
  resumeSyncForDrag();
}

onMounted(() => {
  window.addEventListener("doc-sync-pause", handleSyncPause);
  window.addEventListener("doc-sync-resume", handleSyncResume);
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
});
</script>

<template>
  <div class="blank-catcher" @pointerdown="handleBlankPointerDown">
    <div ref="rootEl" class="single-doc-editor">
      <EditorContent :editor="editor" />
      <DocOutlineNav :rootEl="rootEl" />
      <p v-if="errorMsg" class="doc-error">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<style scoped>
.blank-catcher {
  position: relative;
  width: calc(100% + 34px);
  height: 100%;

  transform: translateX(-44px);
  padding-left: 44px;
  padding-right: 20px;
}
.single-doc-editor {
  position: relative;
  max-width: 820px;
  margin: 0 auto;
  transform: translateX(-26px);
  padding-bottom: 300px;
}

:deep(.single-doc-editor-content),
:deep(.ProseMirror) {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 20px;
  outline: none;
  cursor: text;
  line-height: 1.5;
  word-break: break-word;
  overflow-wrap: anywhere;
  white-space: normal;
  --doc-gutter: 0px;
  --doc-gutter-hit: 28px;
  --doc-indent-step: 24px;
  --doc-content-x: 0px;
  --doc-content-y: 0px;
  --doc-marker-x: -12px;
  --doc-marker-y: 4px;
  --doc-marker-col: 24px;
}

:deep(.doc-item) {
  display: grid;
  grid-template-columns: 0px 1fr;
  column-gap: 0px;
  align-items: start;
  margin: 0;
  width: 100%;
  position: relative;
  overflow: visible;
  padding-left: calc(var(--doc-gutter-hit) + var(--doc-item-indent, 0px));
  margin-left: calc(-1 * var(--doc-gutter-hit));
  box-sizing: border-box;
  color: var(--doc-item-text-color, inherit);
  background-color: var(--doc-item-bg-color, transparent);
  font-family: var(--doc-item-font-family, inherit);
  --doc-placeholder-size: 16px;
  --doc-placeholder-weight: 400;
  --doc-placeholder-line: 1.5;
  --doc-placeholder-y: 4px;
  --doc-comment-badge-y: 4px;
}

:deep(.doc-item.has-comments .doc-node) {
  display: inline-block;
  max-width: 100%;
  background: rgba(255, 221, 64, 0.18);
  padding: 0 2px;
  border-radius: 2px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  text-decoration: underline;
  text-decoration-color: rgba(255, 221, 64, 0.9);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

:deep(.doc-comment-badge) {
  position: absolute;
  right: -34px;
  top: var(--doc-comment-badge-y, 4px);
  border: 0px solid rgba(255, 255, 255, 0.14);
  background: rgba(24, 24, 24, 0.75);
  color: var(--text-secondary);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-size: 25px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transform: translateX(6px);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
  pointer-events: auto;
  white-space: nowrap;
  z-index: 2;
  max-width: none;
  background-color: transparent;
}

:deep(.doc-comment-badge .doc-comment-icon) {
  display: inline-flex;
  align-items: center;
}

:deep(.doc-item:hover .doc-comment-badge),
:deep(.doc-item.has-comments .doc-comment-badge) {
  opacity: 1;
  transform: translateX(0);
}

:deep(.doc-comment-badge .doc-comment-count) {
  display: inline-flex;
  align-items: center;
  min-width: 10px;
  font-weight: 700;
  color: var(--text-main);
  font-size: 12px;
  line-height: 1;
  margin-left: 2px;
}

:deep(.doc-comment-badge:not(.has-count) .doc-comment-count) {
  display: none;
}

:deep(.doc-comment-badge:not(.has-count) .doc-comment-count) {
  display: none;
}

:deep(.doc-item--list) {
  grid-template-columns: var(--doc-marker-col) 1fr;
}

:deep(.doc-item--todo) {
  grid-template-columns: var(--doc-marker-col) 1fr;
}

:deep(.doc-item--h1) {
  --doc-comment-badge-y: 10px;
}

:deep(.doc-item--h2) {
  --doc-comment-badge-y: 8px;
}

:deep(.doc-item--h3) {
  --doc-comment-badge-y: 6px;
}

:deep(.doc-item--code) {
  --doc-comment-badge-y: 6px;
}

:deep(.doc-item--quote) {
  --doc-comment-badge-y: 4px;
}

:deep(.doc-item--divider) {
  --doc-comment-badge-y: 0px;
}

:deep(.doc-item--list),
:deep(.doc-item--todo) {
  --doc-comment-badge-y: 2px;
}

:deep(.doc-item-content) {
  display: block;
}

:deep(.doc-simple-handle) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--doc-gutter);
  height: 1.6em;
  pointer-events: auto;
  cursor: grab;
  gap: var(--doc-handle-gap);
  transform: translate(var(--doc-handle-x), var(--doc-handle-y));
}

:deep(.doc-simple-grip) {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 2px 6px;
  cursor: grab;
  color: var(--text-secondary);
  line-height: 1;
  font-size: var(--doc-handle-size);
}

:deep(.doc-simple-plus) {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 2px 6px;
  cursor: pointer;
  color: var(--text-secondary);
  line-height: 1;
  font-size: var(--doc-handle-size);
}

:deep(.doc-simple-plus:hover) {
  background: var(--bg-hover);
  color: var(--text-main);
}

:deep(.doc-simple-grip:hover) {
  background: var(--bg-hover);
  color: var(--text-main);
}

:global(.doc-simple-handle) {
  --doc-handle-x: 18px;
  --doc-handle-y: 3px;
  --doc-handle-y-todo: 8px;
  --doc-handle-size: 26px;
  --doc-handle-gap: 4px;
}

:global(.doc-simple-handle[data-block-type="todo"]) {
  --doc-handle-y: var(--doc-handle-y-todo);
}

:global(.doc-simple-handle[data-block-size="h1"]) {
  --doc-handle-y: 22px;
  /* --doc-handle-size: 16px;*/
}

:global(.doc-simple-handle[data-block-size="h2"]) {
  --doc-handle-y: 17px;
  /*--doc-handle-size: 15px;*/
}

:global(.doc-simple-handle[data-block-size="h3"]) {
  --doc-handle-y: 3px;
  /*--doc-handle-size: 14px;*/
}

:global(.doc-simple-handle),
:global(.doc-simple-grip),
:global(.doc-simple-plus) {
  -webkit-user-drag: none;
}

:global(.doc-dragging .ProseMirror),
:global(.doc-dragging .single-doc-editor-content) {
  cursor: grabbing;
  caret-color: transparent;
}

:global(.doc-drag-ghost) {
  opacity: 0.75;
  transform: scale(0.98);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  background: var(--bg-main, #141414);
  z-index: 10000;
}

:global(.doc-drop-line) {
  position: fixed;
  height: 2px;
  opacity: 0;
  pointer-events: none;
  background: rgba(100, 150, 255, 0.7);
  border-radius: 2px;
  transform: translateY(-1px);
  transition: opacity 80ms linear;
  z-index: 9999;
}

:global(.doc-drop-inside) {
  position: fixed;
  opacity: 0;
  pointer-events: none;
  background: rgba(100, 150, 255, 0.08);
  border: 1px solid rgba(100, 150, 255, 0.35);
  border-radius: 8px;
  transition: opacity 80ms linear;
  z-index: 9998;
}

/*:global(.doc-item--list > .doc-item-content > .doc-item) {
  padding-left: clamp(
    0px,
    calc(var(--doc-indent-step) - var(--doc-marker-col)),
    999px
  );

}*/

:deep(.doc-item-marker) {
  justify-self: end;
  color: var(--text-secondary);
  transform: translate(var(--doc-marker-x), var(--doc-marker-y));
  line-height: 1.6;
  opacity: 0;
}

:deep(.doc-item--list .doc-item-marker) {
  opacity: 1;
}

:deep(.doc-item--todo .doc-item-marker) {
  opacity: 1;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--border-todo);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-main);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transform: translate(var(--doc-marker-x), calc(var(--doc-marker-y) + 8px));
  user-select: none;
}

:deep(.doc-item--todo .doc-item-marker[data-checked="true"]) {
  background: var(--todo-checked-bg, #3b82f6);
  border-color: var(--todo-checked-border, #3b82f6);
  color: var(--todo-checked-color, #ffffff);
}

:deep(.doc-item--todo[data-todo-checked="true"] .doc-item-content > *) {
  opacity: 0.6;
  text-decoration: line-through;
}

:deep(.doc-item-content) {
  transform: translate(var(--doc-content-x), var(--doc-content-y));
}

:deep(.doc-item-content > *),
:deep(.doc-node) {
  margin: 0;
}

:deep(.doc-item--p .doc-item-content > *),
:deep(.doc-item--todo .doc-item-content > *) {
  margin: 4px 0;
}

:deep(.doc-item--todo .doc-item-content > *) {
  margin-top: 6px;
  margin-top: 4px;
  padding-top: 4px;
  padding-bottom: 4px;
}

:deep(.doc-item--h1 .doc-item-content > *) {
  margin: 14px 0 8px;
}

:deep(.doc-item--h2 .doc-item-content > *) {
  margin: 12px 0 6px;
}

:deep(.doc-item--h3 .doc-item-content > *) {
  margin: 10px 0 4px;
}

:deep(.doc-item--quote .doc-item-content > *) {
  margin: 6px 0;
}

:deep(.doc-item--code .doc-item-content > *) {
  margin: 6px 0;
}

:deep(.doc-item--divider .doc-item-content > *) {
  margin: 10px 0;
}

:deep(.doc-item--h1 .doc-item-content > *) {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
}

:deep(.doc-item--h1) {
  --doc-placeholder-size: 32px;
  --doc-placeholder-weight: 700;
  --doc-placeholder-line: 1.2;
  --doc-placeholder-y: 14px;
}

:deep(.doc-item--todo) {
  --doc-placeholder-y: 8px;
}

:deep(.doc-item--h2 .doc-item-content > *) {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
}

:deep(.doc-item--h2) {
  --doc-placeholder-size: 26px;
  --doc-placeholder-weight: 600;
  --doc-placeholder-line: 1.3;
  --doc-placeholder-y: 12px;
}

:deep(.doc-item--h3 .doc-item-content > *) {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.35;
}

:deep(.doc-item--h3) {
  --doc-placeholder-size: 22px;
  --doc-placeholder-weight: 600;
  --doc-placeholder-line: 1.35;
  --doc-placeholder-y: 10px;
}

:deep(.doc-item--list .doc-item-content > *) {
  font-size: 16px;
  font-weight: 400;
  line-height: 1.5;
}

:deep(.doc-item--quote .doc-item-content) {
  border-left: 3px solid var(--border-main, rgba(255, 255, 255, 0.2));
  padding-left: 12px;

  opacity: 0.9;
}

:deep(.doc-item--code .doc-item-content) {
  font-family:
    "JetBrainsMono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px 10px;
  padding-top: 35px;
  padding-bottom: 35px;
  padding-left: 24px;
  padding-right: 30px;
}

:deep(.doc-item--code .doc-item-content pre),
:deep(.doc-item--code .doc-item-content code) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

:deep(.doc-item--code[data-code-wrap="false"] .doc-item-content pre),
:deep(.doc-item--code[data-code-wrap="false"] .doc-item-content code) {
  white-space: pre;
}

/* scroll visibile quando wrap è attivo */
:deep(.doc-item--code[data-code-wrap="false"] .doc-item-content) {
  overflow-x: scroll;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.26) transparent;
  scrollbar-gutter: stable;
}

:deep(
  .doc-item--code[data-code-wrap="false"] .doc-item-content::-webkit-scrollbar
) {
  height: 13px;
}

:deep(
  .doc-item--code[data-code-wrap="false"]
    .doc-item-content::-webkit-scrollbar-thumb
) {
  background: rgba(0, 0, 0, 0.26);
  border-radius: 10px;
  border: 3px solid transparent;
  background-clip: content-box;
}

:deep(.doc-item--code[data-code-wrap="false"] .doc-item-content) {
  overflow-x: auto;
}

:deep(.doc-code-toolbar) {
  position: absolute;
  top: var(--code-toolbar-top);
  right: 5px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

:deep(.doc-item--code:hover .doc-code-toolbar),
:deep(.doc-item--code:focus-within .doc-code-toolbar) {
  opacity: 1;
  pointer-events: auto;
}

:deep(.doc-code-toolbar-group) {
  display: inline-flex;
  align-items: stretch;
  height: var(--block-row-btn);
  border-radius: 6px;

  background: var(--bg-icon-transp);
  box-shadow: inset 0 0 0 1.2px var(--border-main);
  overflow: hidden;
}

:deep(.doc-code-toolbar-segment) {
  border: 0;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  font-size: 13px;
  color: var(--icon-secondary);
  transition:
    background 120ms ease,
    color 120ms ease;
}

:deep(.doc-code-toolbar-segment.icon) {
  width: var(--block-row-btn);
  padding: 0;
}

:deep(.doc-code-toolbar-segment:hover) {
  background: var(--bg-icon-hover);
  color: var(--icon-main);
}

:deep(.doc-code-toolbar-segment.lang) {
  gap: 6px;
  font-weight: 500;
}

:deep(.doc-code-toolbar .caret) {
  font-size: 11px;
  opacity: 0.6;
  transform: translateY(-1px);
}

:deep(.doc-code-toolbar-separator) {
  width: 1px;
  background: var(--border-main);
  opacity: 0.6;
}

:deep(.doc-item--code .hljs-comment) {
  color: var(--cm-syntax-comment);
  font-style: italic;
}

:deep(.doc-item--code .hljs-keyword),
:deep(.doc-item--code .hljs-selector-tag),
:deep(.doc-item--code .hljs-literal),
:deep(.doc-item--code .hljs-built_in) {
  color: var(--cm-syntax-keyword);
}

:deep(.doc-item--code .hljs-string),
:deep(.doc-item--code .hljs-attr),
:deep(.doc-item--code .hljs-attribute) {
  color: var(--cm-syntax-string);
}

:deep(.doc-item--code .hljs-number),
:deep(.doc-item--code .hljs-symbol) {
  color: var(--cm-syntax-number);
}

:deep(.doc-item--code .hljs-title),
:deep(.doc-item--code .hljs-function),
:deep(.doc-item--code .hljs-name) {
  color: var(--cm-syntax-fn);
}

:deep(.doc-item--code .hljs-type),
:deep(.doc-item--code .hljs-class),
:deep(.doc-item--code .hljs-params) {
  color: var(--cm-syntax-type);
}

:deep(.doc-item--code .hljs-meta),
:deep(.doc-item--code .hljs-operator) {
  color: var(--cm-syntax-meta);
}

:deep(.doc-item--code .hljs-variable) {
  color: var(--cm-syntax-name);
}

:deep(.doc-item--code) {
  --doc-placeholder-size: 13px;
  --doc-placeholder-weight: 400;
  --doc-placeholder-line: 1.35;
}

:deep(.doc-item--divider .doc-item-content > hr) {
  border: 0;
  border-top: 1px solid var(--border-main, rgba(255, 255, 255, 0.2));
  margin: 8px 0;
}

:deep(.doc-node) {
  transform: translate(var(--doc-content-x), var(--doc-content-y));
}

:deep(.ProseMirror > *) {
  margin: 0;
}

:deep(.single-doc-editor-content > .doc-node.is-empty-node),
:deep(.ProseMirror > .doc-node.is-empty-node) {
  display: none;
}

:deep(.ProseMirror-focused .doc-item.is-empty-node)::before,
:deep(.ProseMirror-focused .doc-item-content .is-empty-node)::before {
  content: attr(data-placeholder);
  color: var(--text-muted, rgba(255, 255, 255, 0.35));
  pointer-events: none;
  display: block;
  grid-column: 2 / -1;
  height: 0;
  white-space: pre-wrap;
  transform: translateY(var(--doc-placeholder-y));
  font-size: var(--doc-placeholder-size);
  font-weight: var(--doc-placeholder-weight);
  line-height: var(--doc-placeholder-line);
}

.doc-error {
  margin-top: 8px;
  color: var(--text-danger, #c0392b);
  font-size: 12px;
}
</style>
