# Notion-Style Editor — Fullstack README

## Run locally (read before starting)

This app requires **three services running in parallel**: Redis, the Django backend (Daphne/ASGI), and the Vite frontend. Before starting, make sure you have the prerequisites installed and the environment configured.

### Prerequisites

- Node.js (for Vite)
- Python 3.10+ (for Django)
- Redis (running locally or via Docker)
- A Python virtual environment created under backend/venv (recommended)

### 1) Start Redis

- If you use Docker:
  - `docker start redis`
- If you use a local installation, start the Redis service for your OS.

### 2) Start the backend (Daphne)

From backend/:

1. Activate the virtual environment.
2. Ensure dependencies are installed from backend/requirements.txt.
3. Run Daphne with the settings module:
   - `set DJANGO_SETTINGS_MODULE=config.settings`
   - `daphne config.asgi:application`

### 3) Start the frontend (Vite)

From frontend/:

1. Install dependencies (first time only):
   - `npm install`
2. Start the dev server:
   - `npm run dev`

### Expected URLs

- Frontend: http://localhost:5173 (default Vite)
- Backend: http://localhost:8000 (default Daphne)

---

## Overview

This project is a **block-based document editor** inspired by tools like Notion. It is built as a **Single Page Application (SPA)** with a Django backend. The core idea is **synchronized application state**: the UI updates instantly, while persistence happens automatically in the background.

---

## Data structure (core domain)

The data model is centered on **Pages** and a **Tiptap document per page**:

- **Page** (backend) includes `parent`, `position`, `favorite`, `favorite_position`, and trash fields (see Page model). Pages can be nested by parent id.
- **TiptapDocument** (backend) stores the editor JSON as `content` with a `version` field and one-to-one link to the page.
- **DraggableItem** (frontend extension) is the block wrapper inside the Tiptap document. It carries attributes such as:
  - `id`, `parentId`, `position` (ordering)
  - `blockType`, `listType`, `listStart`, `todoChecked`
  - visual metadata like `font`, `textColor`, `bgColor`

Ordering is handled in the frontend using **fractional-indexing** via `posBetween()` in the domain helpers.

---

## Editor features

The editor is built on **Tiptap/ProseMirror** and includes:

- StarterKit base behavior (paragraphs, lists, etc.)
- Headings, blockquotes, code blocks (lowlight), highlights, links, placeholders
- Custom extensions for **draggable block rows** and **drag handles**
- Paste handling that can split content into multiple blocks
- Document outline navigation component

---

## Custom Tiptap node and block types

The editor wraps each logical block in a **custom Tiptap node** called `draggableItem`.
It stores block metadata as attributes (id, parentId, position, blockType, listType, listStart, todoChecked, font, textColor, bgColor, codeWrap) and enables nested, reorderable rows.

Available block types (from the block type catalog) are:

- `p` (Paragraph)
- `h1`, `h2`, `h3` (Headings)
- `ul` (Bulleted list)
- `ol` (Numbered list)
- `todo` (To‑do list item)
- `quote` (Block quote)
- `code` (Code block)
- `divider` (Horizontal separator)

List types map to `listType` (`bullet`/`ordered`) while the rendered block stays a paragraph wrapper with list styling.

---

## Pie menu

The editor uses a **radial pie menu** for fast, context-aware actions. It is rendered as an overlay and positioned around the cursor, with separate pie variants for block types, text colors, and highlights.

Key characteristics:

- **Ring layout** with hover/selection previews (see `PieMenu` and `PieBlockTypeMenu`).
- **Context-driven actions**: the menu dispatches commands through the unified command system (`MENU_COMMANDS` + `useMenuActionDispatcher`).
- **Overlay-managed lifecycle**: the pie menu is mounted through the overlay stack, so it respects focus, close-on-outside, and z‑index ordering.

---

## UI and drag & drop

The UI is designed to feel **lightweight and responsive** under constant editing.

- **Editor drag & drop** uses the DraggableItem extension plus a custom drag-handle extension.
- **Sidebar drag & drop** uses `DndController` to reorder pages, including favorites and nested trees.
- Ordering uses fractional keys (`posBetween`) rather than array indices, which keeps reordering stable.
- While dragging in realtime, the editor temporarily suspends Yjs awareness to avoid noisy presence updates.

---

## Sidebar lists and layout modes

The sidebar renders **multiple lists** driven by store state:

- **Favorites** (flat list, reorderable)
- **Private Pages** (tree, nested)
- **Shared Pages** (tree, nested)
- **Trash** entry in the footer

Layout modes are:

- **Flyout (overlay)**: used when the sidebar is hidden; the flyout opens on hover and is managed via overlay layer bindings.
- **Docked**: persistent sidebar with resize handle and stored width.

This “double layout” allows a balance between maximum writing space and fast navigation.

---

## Global state management (Pinia)

Pinia stores provide a **single source of truth** across the UI, including:

- Pages, UI, overlays, documents, comments, and collaboration state

Two cross-cutting systems are emphasized:

- **Unified command system**: menu commands are defined in the menu domain and dispatched through a single handler (`useMenuActionDispatcher`) that routes to `useAppActions` and editor commands.
- **Overlay binding manager**: overlays are registered/bound in the overlay store using binding composables (`useOverlayBinding`, `useOverlayBindingKeyed`) to keep menus and popovers in sync with state.

---

## Realtime collaboration

Realtime is implemented via **Yjs** on top of Django Channels:

- The editor connects to a Yjs websocket (`/ws/yjs`) using `WebsocketProvider`.
- The backend persists Yjs updates via `YjsDocumentConsumer` and a SQLite-backed Yjs store.
- Presence is read from Yjs awareness and stored in the collaboration store for UI display.

---

## Comment system (brief)

Comments are tied to **document nodes** rather than whole pages:

- Each thread is anchored by `doc_node_id` (from draggable items) and stored in `CommentThread`.
- Comments are stored in `Comment` and loaded by page or node.
- A comments websocket (`/ws/comments`) pushes `thread_created`, `comment_created`, and `thread_deleted` events to keep counts and badges live.

---

## Frontend (Vue 3 + Pinia)

The frontend owns the entire user experience and maintains the local source of truth.

### Key concepts

- **Optimistic UI**: user edits appear immediately.
- **Centralized state**: Pinia stores manage pages, documents, overlays, comments, and collaboration state.
- **Doc-level sync state**: document loading/saving flags live in the doc store for per-page persistence.

### Code structure highlights

- Pinia stores: pages, docstore, UI, overlays, comments, collaboration
- Vue components: page, editor, block types
- API services: Axios-based HTTP layer, separated from state logic

---

## Backend (Django REST Framework + Channels)

The backend is the **authoritative source of data**.

### Responsibilities

- Authentication and ownership checks
- Validation and persistence of data
- Atomic updates with safe, consistent relationships

### Code structure highlights

- Models: `Page`, `TiptapDocument`, comments, collaboration/invite entities
- Serializers: input validation and API shaping
- Views: RESTful CRUD + PATCH for incremental updates
- Channels: realtime/collaboration plumbing (ASGI)

---

## Database

Although the UI feels freeform, the database is **strongly relational** for pages, collaboration, and comments, while the editor content is stored as JSON in **TiptapDocument**.

### Why this matters

- The document can evolve without schema migrations for each block type
- Pages and collaboration remain relational and safe
- Comments remain anchored to stable doc node ids

Realtime Yjs updates are persisted in a separate SQLite-backed Yjs store (`yjs.sqlite3`).

---

## Conceptual data model

### Page

- Belongs to a user
- Has a title
- Can reference a parent page (nested pages)

### TiptapDocument

- One-to-one with a page
- Stores editor JSON in `content`
- Tracks `version`, `created_at`, `updated_at`

### CommentThread + Comment

- Thread anchored by `doc_node_id`
- Comment body and author stored per thread

---

## Edit flow (end-to-end)

1. **User input** — the user types.
2. **Reactive update** — Vue updates the UI instantly.
3. **Doc state update** — the editor JSON is stored in the doc store.
4. **Auto-save (debounced)** — the doc is patched to `/pages/:id/doc/`.
5. **Backend persist** — the server updates `TiptapDocument`.
6. **Sync feedback** — UI updates saving state from the doc store.

This flow ensures responsiveness without sacrificing consistency.

---

## Structure-to-feature mapping

- Editor document → `TiptapDocument` + Tiptap JSON
- Nested content → `draggableItem` attributes (`parentId`, `position`)
- Auto-save → frontend debounce + backend PATCH to `/pages/:id/doc/`
- Drag & drop → DraggableItem + drag handle extensions + fractional keys
- Optimistic UI → editor state updates immediately, persistence async
- Scale-ready design → clean separation of domain, API, state

---

## Notes

- For deeper technical notes, see:
  - [ROADMAP.md](ROADMAP.md)
  - [INTENTBYCONTEXT.md](INTENTBYCONTEXT.md)
  - [BLOCKS_STORE_USAGE.md](BLOCKS_STORE_USAGE.md)
