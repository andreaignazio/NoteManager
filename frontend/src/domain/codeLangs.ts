export const LANGS = [
  { id: "plaintext", label: "Plain text" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "json", label: "JSON" },
  { id: "bash", label: "Bash" },
  { id: "sql", label: "SQL" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "markdown", label: "Markdown" },
  { id: "yaml", label: "YAML" },
];

export function getLangLabel(langId: string): string {
  const lang = LANGS.find((l) => l.id === langId);
  return lang ? lang.label : "Unknown";
}
