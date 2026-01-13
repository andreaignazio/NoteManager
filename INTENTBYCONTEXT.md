# Blocks Drag & Drop – Structural Rules & Intents

Questo documento definisce **le regole strutturali** e **le operazioni consentite** per il sistema di drag & drop dei blocchi, includendo layout a colonne (row/column) e nesting verticale (indent).

---

## 1. Tipi di nodo (`kind`)

Ogni nodo ha un campo `kind` che definisce il suo ruolo strutturale:

- `block`   → contenuto (paragraph, code, image, ecc.)
- `row`     → contenitore orizzontale (colonne)
- `column`  → contenitore verticale all’interno di una row

> Nota: il campo `type` rimane riservato al **tipo di blocco contenutistico** (`paragraph`, `code`, ecc.).

---

## 2. Invarianti strutturali (sempre vere)

### Gerarchia
1. `row` può contenere **solo** `column`
2. `column` deve avere come parent **sempre** una `row`
3. `block` può avere come parent:
   - `null` (root della pagina)
   - un altro `block` (nesting verticale)
   - una `column` (layout a colonne)

### Nesting
4. Se un `block` ha **un ancestor di tipo `row`**, allora:
   - **non può** avere `parentId = blockId`
   - quindi **non esiste nesting block→block dentro colonne**

### Position
5. `position` è sempre **relativa ai siblings con lo stesso `parentId`**
6. Il sistema di ordinamento (`posBetween`) non cambia con row/column

---

## 3. Contesti logici

Definiamo due contesti principali:

### Flow verticale puro
Un nodo è in *flow puro* se **nessun suo ancestor è una `row`**.

Esempi:
- blocchi direttamente sulla pagina
- blocchi nested tramite indent (Tab)
- blocchi figli di altri blocchi (finché non c’è una row sopra)

### Contesto colonne
Un nodo è in *contesto colonne* se **esiste almeno una `row` tra i suoi ancestors**.

Esempi:
- blocchi dentro una `column`
- qualunque discendente di una column

---

## 4. Intent di Drag & Drop

### Tipi di intent
- `line`   → inserimento sopra/sotto (reorder verticale)
- `inside` → rende il blocco figlio di un altro blocco (nesting)
- `side`   → layout a colonne (left / right)

---

## 5. Tabella riassuntiva: intent consentiti

### In Flow Verticale Puro

| Intent   | Consentito | Comportamento |
|--------|------------|---------------|
| line   | ✅ sì       | reorder verticale |
| inside | ✅ sì       | nesting (append come ultimo figlio) |
| side   | ✅ sì       | `wrapIntoRow` (crea row + 2 columns) |

---

### In Contesto Colonne (row ancestor presente)

| Intent   | Consentito | Comportamento |
|--------|------------|---------------|
| line   | ✅ sì       | reorder verticale dentro la stessa column |
| inside | ❌ no       | nesting vietato |
| side   | ✅ sì       | `insertColumnAdjacent` nella row più vicina |

---

## 6. Indent / Outdent (Tab / Shift-Tab)

### Consentito se e solo se:
- `block.kind === 'block'`
- **nessun ancestor del blocco è una `row`**
- il blocco precedente (per indent) è anch’esso in flow puro

### Effetto:
- `Tab` → il blocco diventa figlio del sibling precedente
- `Shift+Tab` → il blocco risale di un livello

### Vietato se:
- il blocco è dentro una `column`
- il blocco ha qualsiasi `row` tra gli ancestors

---

## 7. Operazioni strutturali speciali

### wrapIntoRow
Usata quando:
- `side-drop` su un target **non** in una row

Effetto:
- crea una `row`
- crea 2 `column`
- sposta `target` e `dragged` in colonne separate
- la `row` prende la `position` originale del target

---

### insertColumnAdjacent
Usata quando:
- `side-drop` su un target **già dentro una row**

Effetto:
- crea una nuova `column` adiacente alla colonna del target
- sposta `dragged` dentro la nuova colonna (append)
- soggetta a `MAX_COLUMNS` (es. 4)

---

## 8. Drag di blocchi con figli (flatten)

### Entrando in contesto colonne
Se un `block` con discendenti viene spostato in una `column`:

- la sua subtree viene **flattened**
- tutti i discendenti diventano siblings nella column
- l’ordine è DFS (pre-order)
- nessun nesting resta dentro colonne

---

### Uscendo da contesto colonne
Se un blocco viene trascinato **fuori** da una column:

- non viene ricostruita automaticamente la gerarchia
- il blocco resta flat
- l’utente può ricreare nesting manualmente con `inside` o `Tab` (se target è in flow puro)

---

## 9. Drop inside da colonna verso flow puro

Consentito se:
- il target è in flow verticale puro (nessun ancestor row)

Effetto:
- il blocco trascinato diventa figlio del target
- `parentId = target.id`
- append come ultimo figlio

---

## 10. Filosofia generale

- **Nesting e layout sono due dimensioni distinte**
- Nesting (`inside`, `Tab`) è consentito solo in flow puro
- Layout (`side`, row/column) è sempre consentito
- Dentro colonne: struttura piatta, prevedibile, senza nesting
- Le regole sono applicate a livello di adapter/store (source of truth)

---
