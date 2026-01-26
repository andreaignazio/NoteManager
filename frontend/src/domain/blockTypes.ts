interface BlockType {
  type: string;
  label: string;
  description: string;
  icon: string;
  iconId: string;
}

export const BLOCK_TYPES: BlockType[] = [
  {
    type: "p",
    label: "Paragraph",
    description: "Regular text",
    icon: "¶",
    iconId: "lucide:type",
  },
  {
    type: "h1",
    label: "Heading 1",
    description: "Large heading",
    icon: "H1",
    iconId: "lucide:heading-1",
  },
  {
    type: "h2",
    label: "Heading 2",
    description: "Medium heading",
    icon: "H2",
    iconId: "lucide:heading-2",
  },
  {
    type: "h3",
    label: "Heading 3",
    description: "Small heading",
    icon: "H3",
    iconId: "lucide:heading-3",
  },
  {
    type: "ul",
    label: "Bulleted List",
    description: "Unordered list",
    icon: "•",
    iconId: "lucide:list",
  },
  {
    type: "ol",
    label: "Numbered List",
    description: "Ordered list",
    icon: "1.",
    iconId: "lucide:list-ordered",
  },
  {
    type: "toggle",
    label: "Toggle List",
    description: "Collapsible list",
    icon: "▸",
    iconId: "lucide:chevron-right",
  },
  {
    type: "todo",
    label: "To-do List",
    description: "Checklist item",
    icon: "☐",
    iconId: "lucide:check-square",
  },
  {
    type: "quote",
    label: "Quote",
    description: "Block quote",
    icon: "❝",
    iconId: "lucide:quote",
  },
  {
    type: "code",
    label: "Code Block",
    description: "Code snippet",
    icon: "</>",
    iconId: "lucide:code",
  },
  {
    type: "callout",
    label: "Callout",
    description: "Highlighted note",
    icon: "💡",
    iconId: "lucide:lightbulb",
  },
  {
    type: "divider",
    label: "Divider",
    description: "Horizontal separator",
    icon: "—",
    iconId: "lucide:minus",
  },
];

export const DEFAULT_BLOCK_TYPE: string = "p";
