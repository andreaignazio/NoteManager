import {
  // base / pages
  File,
  FileText,
  Files,
  StickyNote,
  NotebookPen,

  // folders / structure
  Folder,
  FolderOpen,
  Archive,
  Box,
  Layers,

  // books / knowledge
  Book,
  BookOpen,
  Library,
  GraduationCap,
  Lightbulb,

  // video / media
  Video,
  Film,
  PlayCircle,
  Music,
  Image,
  Headphones,

  // tasks / productivity
  CheckSquare,
  CheckCircle2,
  ListTodo,
  ClipboardList,
  Clock,
  Calendar,
  Flag,

  // tags / organization
  Tag,
  Bookmark,
  Star,
  Pin,

  // links / web
  Link,
  Globe,

  // utility / system
  Search,
  Settings,
  Trash2,
  Edit3,
  Users,
} from "lucide-vue-next"


export const ICONS = [
  // ===== Pages / Notes =====
  { id: "lucide:file", label: "File", icon: File, category: "pages" },
  { id: "lucide:file-text", label: "Documento", icon: FileText, category: "pages" },
  { id: "lucide:files", label: "Documenti", icon: Files, category: "pages" },
  { id: "lucide:sticky-note", label: "Nota", icon: StickyNote, category: "pages" },
  { id: "lucide:notebook-pen", label: "Appunti", icon: NotebookPen, category: "pages" },

  // ===== Folders / Structure =====
  { id: "lucide:folder", label: "Cartella", icon: Folder, category: "folders" },
  { id: "lucide:folder-open", label: "Cartella aperta", icon: FolderOpen, category: "folders" },
  { id: "lucide:archive", label: "Archivio", icon: Archive, category: "folders" },
  { id: "lucide:box", label: "Raccolta", icon: Box, category: "folders" },
  { id: "lucide:layers", label: "Sezioni", icon: Layers, category: "folders" },

  // ===== Books / Knowledge =====
  { id: "lucide:book", label: "Libro", icon: Book, category: "books" },
  { id: "lucide:book-open", label: "Studio", icon: BookOpen, category: "books" },
  { id: "lucide:library", label: "Libreria", icon: Library, category: "books" },
  { id: "lucide:graduation-cap", label: "Corso", icon: GraduationCap, category: "books" },
  { id: "lucide:lightbulb", label: "Idea", icon: Lightbulb, category: "books" },

  // ===== Video / Media =====
  { id: "lucide:video", label: "Video", icon: Video, category: "media" },
  { id: "lucide:film", label: "Film", icon: Film, category: "media" },
  { id: "lucide:play-circle", label: "Riproduci", icon: PlayCircle, category: "media" },
  { id: "lucide:music", label: "Musica", icon: Music, category: "media" },
  { id: "lucide:image", label: "Immagine", icon: Image, category: "media" },
  { id: "lucide:headphones", label: "Podcast", icon: Headphones, category: "media" },

  // ===== Tasks / Productivity =====
  { id: "lucide:check-square", label: "Task", icon: CheckSquare, category: "tasks" },
  { id: "lucide:check-circle-2", label: "Completato", icon: CheckCircle2, category: "tasks" },
  { id: "lucide:list-todo", label: "Todo list", icon: ListTodo, category: "tasks" },
  { id: "lucide:clipboard-list", label: "Checklist", icon: ClipboardList, category: "tasks" },
  { id: "lucide:clock", label: "Tempo", icon: Clock, category: "tasks" },
  { id: "lucide:calendar", label: "Calendario", icon: Calendar, category: "tasks" },
  { id: "lucide:flag", label: "Obiettivo", icon: Flag, category: "tasks" },

  // ===== Tags / Organization =====
  { id: "lucide:tag", label: "Tag", icon: Tag, category: "tags" },
  { id: "lucide:bookmark", label: "Segnalibro", icon: Bookmark, category: "tags" },
  { id: "lucide:star", label: "Preferito", icon: Star, category: "tags" },
  { id: "lucide:pin", label: "In evidenza", icon: Pin, category: "tags" },

  // ===== Links / Web =====
  { id: "lucide:link", label: "Link", icon: Link, category: "web" },
  { id: "lucide:globe", label: "Web", icon: Globe, category: "web" },

  // ===== Utility / System =====
  { id: "lucide:search", label: "Ricerca", icon: Search, category: "system" },
  { id: "lucide:settings", label: "Impostazioni", icon: Settings, category: "system" },
  { id: "lucide:edit-3", label: "Modifica", icon: Edit3, category: "system" },
  { id: "lucide:users", label: "Team", icon: Users, category: "system" },
  { id: "lucide:trash-2", label: "Cestino", icon: Trash2, category: "system" },
]


export const ICON_BY_ID = Object.fromEntries(
  ICONS.map(i => [i.id, i.icon])
)

export const DEFAULT_ICON_ID = "lucide:file"


export function getIconComponent(id) {
  if (typeof id !== "string") {
    return ICON_BY_ID[DEFAULT_ICON_ID]
  }
  return ICON_BY_ID[id] || ICON_BY_ID[DEFAULT_ICON_ID]
}