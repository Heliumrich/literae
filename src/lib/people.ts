export const PERSON_TYPES = [
  { key: "artist", labels: ["artist", "artiste"], fr: "Artiste" },
  { key: "saint", labels: ["saint"], fr: "Saint" },
  { key: "monarch", labels: ["monarch", "monarque"], fr: "Monarque" },
  { key: "author", labels: ["author", "auteur", "writer", "ecrivain", "écrivain"], fr: "Auteur" },
  { key: "other", labels: ["other", "autre"], fr: "Autre" },
] as const;

export type PersonTypeKey = (typeof PERSON_TYPES)[number]["key"];

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizePersonType(value: string): PersonTypeKey | null {
  const raw = fold(value);
  const found = PERSON_TYPES.find((type) => {
    const labels: readonly string[] = type.labels;
    return labels.includes(raw) || fold(type.fr) === raw;
  });
  return found?.key ?? null;
}

export function parsePersonTypes(value: unknown): PersonTypeKey[] {
  const parts = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|]/)
      : [];
  const keys = parts
    .map((part) => normalizePersonType(String(part)))
    .filter((key): key is PersonTypeKey => Boolean(key));
  return [...new Set(keys)];
}

export function personTypeLabel(key: PersonTypeKey) {
  return PERSON_TYPES.find((t) => t.key === key)?.fr || key;
}

export function formatPersonRoles(keys: PersonTypeKey[]) {
  const labels = keys.map(personTypeLabel);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} et ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}

/** Display titles come from the person type; CMS names and slugs stay unchanged. */
export function personName(name: string, type: unknown): string {
  if (!parsePersonTypes(type).includes('saint')) return name;
  if (/^saint(?:e)?[\s-]/i.test(name)) return name.replace(/^saint(e)?/i, (_, ending: string | undefined) => `saint${ending?.toLowerCase() || ''}`);
  if (/^ste?\.?[\s-]/i.test(name)) return name.replace(/^s(te|t)\.?(?=[\s-])/i, (_, ending: string) => ending.toLowerCase() === 'te' ? 'sainte' : 'saint');
  return `saint ${name}`;
}

/** Normalize root people and joined authors/depicted people once, before rendering. */
export function withPersonTitles<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => withPersonTitles(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const row = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withPersonTitles(item)]));
  if (typeof row.name === 'string') row.name = personName(row.name, row.type);
  return row as T;
}
