import { defineStore } from "pinia";

// ===========================
// TYPE DEFINITIONS
// ===========================

type SidebarMode = "docked" | "hidden";
type ThemeMode = "light" | "dark" | "system";

interface ClipboardData {
  html: string | null;
  text: string | null;
  ts: number;
}

interface LinkPopoverRequest {
  [key: string]: any;
}

interface UIStoreState {
  sidebarMode: SidebarMode;
  sidebarWidth: number;

  themeMode: ThemeMode;
  lastOpenedPageId: string | null;

  _hydrated: boolean;
  topbarHidden: boolean;

  pageViewOnPointer: Array<(e: PointerEvent) => void>;

  SidebarMoveToArmed: boolean;
  SidebarMoveToHoverPageId: string | number | null;

  recentlyAddedPageId: string | number | null;

  pendingSidebarScrollToPageId: string | number | null;
  pendingPageviewScrollToBlockId: string | number | null;

  lastHighlightColor: string | null;

  richClipboard: ClipboardData;
  requestLinkPopover: LinkPopoverRequest | null;
}

interface StorageData {
  sidebarMode?: string;
  sidebarWidth?: number;
  themeMode?: string;
  lastOpenedPageId?: string;
}

// ===========================
// HELPER FUNCTIONS
// ===========================

const STORAGE_KEY = "myasset.ui.v1";

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

// ===========================
// STORE DEFINITION
// ===========================

export const useUiStore = defineStore("ui", {
  state: (): UIStoreState => ({
    sidebarMode: "docked",
    sidebarWidth: 280,

    themeMode: "light",
    lastOpenedPageId: null,

    _hydrated: false,
    topbarHidden: false,

    pageViewOnPointer: [],

    SidebarMoveToArmed: false,
    SidebarMoveToHoverPageId: null,

    recentlyAddedPageId: null,

    pendingSidebarScrollToPageId: null,
    pendingPageviewScrollToBlockId: null,

    lastHighlightColor: null,

    richClipboard: { html: null, text: null, ts: 0 },
    requestLinkPopover: null,
  }),

  getters: {
    sidebarMinWidth(): number {
      return 220;
    },

    sidebarMaxWidth(): number {
      return 420;
    },

    topbarHeight(): number {
      return 52;
    },
  },

  actions: {
    // ===========================
    // SIDEBAR MOVE-TO
    // ===========================

    armMoveTo(): void {
      this.SidebarMoveToArmed = true;
      this.SidebarMoveToHoverPageId = null;
    },

    disarmMoveTo(): void {
      this.SidebarMoveToArmed = false;
      this.SidebarMoveToHoverPageId = null;
    },

    setMoveToHoverPageId(id: string | number | null): void {
      this.SidebarMoveToHoverPageId = id;
    },

    // ===========================
    // SCROLL REQUESTS
    // ===========================

    requestScrollToPage(pageId: string | number): void {
      this.pendingSidebarScrollToPageId = pageId;
    },

    consumeScrollToPageRequest(pageId: string | number): boolean {
      if (this.pendingSidebarScrollToPageId === pageId) {
        this.pendingSidebarScrollToPageId = null;
        return true;
      }
      return false;
    },

    requestScrollToBlock(blockId: string | number): void {
      this.pendingPageviewScrollToBlockId = blockId;
    },

    consumeScrollToBlockRequest(blockId: string | number): boolean {
      if (this.pendingPageviewScrollToBlockId === blockId) {
        this.pendingPageviewScrollToBlockId = null;
        return true;
      }
      return false;
    },

    // ===========================
    // TOPBAR
    // ===========================

    setTopbarHidden(v: boolean): void {
      this.topbarHidden = !!v;
    },

    // ===========================
    // THEME
    // ===========================

    applyTheme(mode: ThemeMode): void {
      const html = document.documentElement;
      if (mode === "dark") {
        html.setAttribute("data-theme", "dark");
      } else if (mode === "light") {
        html.setAttribute("data-theme", "light");
      }
    },

    toggleTheme(): void {
      if (this.themeMode === "light") {
        this.themeMode = "dark";
        this.applyTheme("dark");
        this.persist();
      } else {
        this.themeMode = "light";
        this.applyTheme("light");
        this.persist();
      }
    },

    setThemeMode(mode: ThemeMode): void {
      if (mode !== "light" && mode !== "dark" && mode !== "system") return;
      this.themeMode = mode;
      this.applyTheme(mode);
      this.persist();
    },

    // ===========================
    // RECENTLY ADDED PAGE
    // ===========================

    setLastAddedPageId(id: string | number): void {
      this.recentlyAddedPageId = id;
      const t = setTimeout(() => {
        this.recentlyAddedPageId = null;
        clearTimeout(t);
      }, 500);
    },

    resetLstAddedPageId(): void {
      this.recentlyAddedPageId = null;
    },

    getLastAddedPageId(): string | number | null {
      return this.recentlyAddedPageId ?? null;
    },

    // ===========================
    // SIDEBAR
    // ===========================

    setSidebarMode(mode: SidebarMode): void {
      if (mode !== "docked" && mode !== "hidden") return;
      this.sidebarMode = mode;
      this.persist();
    },

    toggleSidebarMode(): void {
      this.setSidebarMode(this.sidebarMode === "docked" ? "hidden" : "docked");
    },

    setSidebarWidth(px: number): void {
      this.sidebarWidth = clamp(px, this.sidebarMinWidth, this.sidebarMaxWidth);
      this.persist();
    },

    // ===========================
    // PERSISTENCE
    // ===========================

    hydrate(): void {
      if (this._hydrated) return;
      this._hydrated = true;

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw) as StorageData;

        if (data?.sidebarMode === "docked" || data?.sidebarMode === "hidden") {
          this.sidebarMode = data.sidebarMode;
        }
        if (typeof data?.sidebarWidth === "number") {
          this.sidebarWidth = clamp(
            data.sidebarWidth,
            this.sidebarMinWidth,
            this.sidebarMaxWidth,
          );
        }
        if (
          data?.themeMode === "light" ||
          data?.themeMode === "dark" ||
          data?.themeMode === "system"
        ) {
          this.themeMode = data.themeMode as ThemeMode;
        }
        if (typeof data?.lastOpenedPageId === "string") {
          this.lastOpenedPageId = data.lastOpenedPageId;
        }
        this.applyTheme(this.themeMode);
      } catch {
        // ignore parsing errors
      }
    },

    persist(): void {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            sidebarMode: this.sidebarMode,
            sidebarWidth: this.sidebarWidth,
            themeMode: this.themeMode,
            lastOpenedPageId: this.lastOpenedPageId,
          }),
        );
      } catch {
        // ignore storage errors
      }
    },

    // ===========================
    // PAGE VIEW POINTER
    // ===========================

    registerPageView(fn: (e: PointerEvent) => void): void {
      this.pageViewOnPointer.push(fn);
    },

    callPageView(e: PointerEvent): void {
      const lastFn = this.pageViewOnPointer[this.pageViewOnPointer.length - 1];
      lastFn?.(e);
    },
  },
});

export default useUiStore;
