export type PageActionsMenuItem =
  | {
      type: "item";
      id: "rename" | "duplicate" | "move" | "share" | "delete";
      label: string;
      iconId?: string;
      disabled?: boolean;
      ariaLabel?: string;
      danger?: boolean;
    }
  | { type: "separator"; id: string };

export function buildPageActionsMenu(opts?: {
  canDelete?: boolean;
}): PageActionsMenuItem[] {
  const canDelete = opts?.canDelete ?? true;
  return [
    { type: "item", id: "rename", label: "Rename", iconId: "lucide:edit-3" },
    {
      type: "item",
      id: "duplicate",
      label: "Duplicate",
      iconId: "lucide:copy",
    },
    { type: "separator", id: "sep:1" },
    {
      type: "item",
      id: "move",
      label: "Move to…",
      iconId: "lucide:folder-input",
    },
    {
      type: "item",
      id: "share",
      label: "Share…",
      iconId: "lucide:link",
    },
    { type: "separator", id: "sep:2" },
    {
      type: "item",
      id: "delete",
      label: "Delete",
      iconId: "lucide:trash-2",
      disabled: !canDelete,
      ariaLabel: !canDelete ? "only owners can delete pages" : undefined,
      danger: true,
    },
  ];
}
