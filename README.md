# Architettura e Funzionamento dell’Applicazione

## Visione generale

L’applicazione è un **editor di documenti block-based**, ispirato a strumenti come Notion, costruito come **Single Page Application (SPA)**.

Il concetto centrale non è la pagina web tradizionale, ma **lo stato applicativo sincronizzato** tra frontend e backend. L’utente interagisce con un’interfaccia estremamente reattiva: ogni modifica viene applicata immediatamente in memoria, mentre la persistenza sul server avviene in modo automatico e trasparente, senza interrompere il flusso di scrittura.

---

## Ruolo dei principali componenti

### Frontend – Vue 3 + Pinia

Il frontend è responsabile dell’intera esperienza utente.

- La UI è **ottimistica**: l’utente scrive e vede il risultato istantaneamente.
- Lo stato delle pagine e dei blocchi è gestito centralmente tramite **Pinia**, che funge da *single source of truth* lato client.
- Ogni blocco mantiene informazioni di sincronizzazione:
  - `dirty`
  - `saving`
  - `error`
  - `lastSavedAt`

Questi campi permettono di:
- sapere se una modifica è già persistita
- mostrare feedback visivo ("saving…", errore)
- ritentare il salvataggio in caso di fallimento

La struttura del codice frontend riflette il dominio applicativo:
- **Store Pinia** per Pages e Blocks
- **Componenti Vue** per Page, Block Editor e singoli tipi di blocco
- **Servizi API** (Axios) separati dalla logica di stato

---

### Backend – Django REST Framework

Il backend rappresenta la **verità assoluta** dei dati.

Il suo ruolo non è gestire l’interattività, ma:
- autenticare l’utente (token-based auth)
- verificare che ogni risorsa appartenga al proprietario
- validare e persistere i dati nel database

Ogni operazione è atomica e sicura:
- nessun blocco può essere modificato da un utente non autorizzato
- le relazioni tra Page e Block sono sempre garantite dal modello dati

La struttura del codice backend segue direttamente il dominio:
- modelli `Page` e `Block`
- serializer per la validazione
- view REST per CRUD e aggiornamenti parziali (PATCH)

---

### Database – PostgreSQL

Sebbene l’interfaccia suggerisca un documento libero e destrutturato, il database è **fortemente relazionale**.

Il concetto chiave è il **Block**:
- ogni pagina è composta da una lista (potenzialmente annidata) di blocchi
- ogni blocco è un’unità indipendente, ordinabile e persistente

Questo approccio consente:
- modifiche granulari
- ordinamento efficiente
- evoluzione naturale verso funzionalità avanzate (drag & drop, nesting)

---

## Modello dati concettuale

### Page
- appartiene a un singolo utente
- ha un titolo modificabile
- può avere una pagina padre (predisposta per pagine annidate)

### Block
- appartiene a una Page
- può avere un `parent_block` (per blocchi annidati)
- possiede un `type` che ne definisce il rendering
- contiene `content` testuale o strutturato
- ha una `position` che definisce l’ordine

L’ordinamento è gestito tramite **fractional indexing**, che permette di inserire blocchi tra altri blocchi senza rinumerare l’intera lista. Questo rende naturale e performante il drag & drop.

---

## Flusso di una modifica

Quando l’utente modifica un blocco:

1. **Input utente** – l’utente digita.
2. **Aggiornamento reattivo** – Vue aggiorna immediatamente la UI.
3. **Aggiornamento store** – Pinia aggiorna lo stato e marca il blocco come `dirty`.
4. **Auto-save con debounce** – dopo un breve intervallo senza input parte il salvataggio.
5. **Persistenza backend** – il server valida, salva e aggiorna `updated_at`.
6. **Sincronizzazione** – il frontend aggiorna `lastSavedAt` e rimuove lo stato `dirty`.

Questo flusso garantisce massima fluidità senza sacrificare coerenza e sicurezza.

---

## Relazione tra funzionalità e struttura del codice

Ogni scelta funzionale ha una diretta conseguenza architetturale:

- Editor a blocchi → modello `Block` indipendente
- Contenuto annidato → `parent_block`
- Auto-save → debounce frontend + PATCH backend
- Drag & drop futuro → fractional indexing già in MVP
- UI ottimistica → stato di sincronizzazione per ogni blocco
- Scalabilità → separazione chiara tra dominio, API e stato

Il codice cresce per **estensione naturale**, non per refactor forzati.

---

## Conclusione

Questa applicazione dimostra come costruire un editor avanzato mantenendo:
- UX fluida
- struttura dati solida
- architettura chiara e difendibile in sede di colloquio

Ogni componente ha un ruolo preciso e ogni scelta è pensata per accompagnare l’evoluzione dall’MVP a un prodotto completo.

