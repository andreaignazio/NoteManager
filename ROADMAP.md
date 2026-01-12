# Roadmap di sviluppo del progetto

Questo documento descrive una roadmap incrementale per lo sviluppo dell’applicazione **Block Editor**, dalla fase di setup fino a un MVP completo e alle estensioni V2. Ogni fase è pensata per mantenere il progetto sempre funzionante, riducendo il rischio di refactor strutturali.

---

## Fase 0 — Setup e fondamenta

L’obiettivo è creare un progetto vuoto ma solido, con convenzioni chiare fin dall’inizio.

### Backend
- Creazione progetto Django
- Configurazione PostgreSQL
- Installazione Django REST Framework
- Configurazione CORS
- Token-based authentication
- UUID come primary key

### Frontend
- Creazione progetto Vue 3 (Vite)
- Installazione Pinia, Vue Router, Axios
- Struttura cartelle:
  - `stores/`
  - `views/`
  - `components/`
  - `services/`

**Risultato:** backend e frontend avviabili con struttura pulita.

---

## Fase 1 — Modello dati e API minime

Qui si costruisce la verità assoluta dell’applicazione.

### Backend
- Modelli:
  - `Page(owner, title, parent, created_at, updated_at)`
  - `Block(page, parent_block, type, content, position, created_at, updated_at)`
- Indici:
  - `(page_id, parent_block_id, position)`
- Endpoint:
  - Auth: login / register
  - Pages: list, create, retrieve
  - Blocks: list by page, create, update (PATCH)

**Risultato:** Pages e Blocks gestibili via API.

---

## Fase 2 — Autenticazione frontend e routing

La SPA diventa realmente utilizzabile.

### Frontend
- Views: Login, Register, AppShell
- `useAuthStore` (token, login, logout)
- Axios interceptor per Authorization header
- Router guards per rotte protette
- Persistenza token in localStorage

**Risultato:** accesso protetto e sessione persistente.

---

## Fase 3 — Sidebar e gestione pagine

Costruzione della navigazione principale.

### Frontend
- `usePagesStore`
- Sidebar con elenco pagine
- Creazione nuova pagina
- Navigazione su `/pages/:id`

**Risultato:** navigazione tra pagine funzionante.

---

## Fase 4 — Rendering dei blocchi

Visualizzazione dei contenuti della pagina.

### Frontend
- `useBlocksStore`
- Fetch blocchi per pagina
- Rendering blocchi top-level (`parent_block = null`)
- Componenti dedicati per tipo di blocco

**Risultato:** la pagina mostra i contenuti salvati.

---

## Fase 5 — Editing locale e auto-save

Il cuore dell’esperienza utente.

### Frontend
- Editing immediato dei blocchi
- Aggiornamento store in tempo reale
- Stato di sincronizzazione (`dirty`, `saving`, `error`)
- Debounce e autosave con PATCH

### Backend
- Endpoint PATCH per blocchi
- Aggiornamento `updated_at`

**Risultato:** editor fluido con salvataggio automatico.

---

## Fase 6 — Creazione, cancellazione e tipi base

Completamento dell’MVP.

### Frontend
- Aggiunta blocchi
- Cancellazione blocchi
- Gestione tipi base (p, h1, h2, h3, list)

### Backend
- Endpoint DELETE block
- Validazioni ownership

**Risultato:** composizione completa delle pagine.

---

## Fase 7 — Fractional indexing

Ordinamento robusto e scalabile.

### Frontend
- Calcolo `position` tra due blocchi
- Update position su insert/move

### Backend
- Query ordinate per `parent_block`, `position`

**Risultato:** ordine stabile senza rinumerazioni.

---

# Roadmap V2

## V2.1 — Batch update e stabilità sync
- Endpoint batch update blocchi
- Riduzione chiamate API
- Retry automatico

## V2.2 — Drag & Drop
- UI drag & drop
- Update `position` e `parent_block`

## V2.3 — Nested pages
- Sidebar ricorsiva
- Breadcrumb nella pagina

## V2.4 — Versioning e conflitti
- Campo `version` o ETag
- Gestione `409 Conflict`

## V2.5 — Image upload
- Blocco image
- Upload file
- Storage locale / S3

---

## Conclusione

Questa roadmap permette uno sviluppo incrementale e controllato, mantenendo l’applicazione sempre utilizzabile e pronta a evolvere da MVP a prodotto completo.