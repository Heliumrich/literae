export type Dogma = { id: string; title: string; description: string; url: string | null; grade: number };
export type DogmaBand = 'danger' | 'caution' | 'nuance' | 'defender' | 'exemplary';
export const dogmaBand = (grade: number): DogmaBand => grade <= -6 ? 'danger'
  : grade < 0 ? 'caution' : grade === 0 ? 'nuance' : grade <= 5 ? 'defender' : 'exemplary';
export const dogmaLabels: Record<DogmaBand, string> = {
  danger: 'Danger doctrinal majeur', caution: 'Point de vigilance', nuance: 'À nuancer',
  defender: 'Défense de la doctrine', exemplary: 'Défense exemplaire de la doctrine',
};

/** Invalid grades and archived entries must never become visible editorial judgements. */
export function normalizeDogma(value: unknown): Dogma | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.archived !== false || typeof row.id !== 'string' || typeof row.title !== 'string' || !row.title.trim()
    || typeof row.grade !== 'number' || !Number.isInteger(row.grade) || Math.abs(row.grade) > 10) return null;
  let url: string | null = null;
  if (typeof row.url === 'string') {
    try { const parsed = new URL(row.url); if (['https:', 'http:'].includes(parsed.protocol)) url = parsed.href; } catch { /* Optional source. */ }
  }
  return { id: row.id, title: row.title.trim(), description: typeof row.description === 'string' ? row.description : '', url, grade: row.grade };
}

export function dogmaGroups(points: Dogma[]) {
  const unique = [...new Map(points.map(point => [point.id, point])).values()];
  return [
    { label: 'Défense de la doctrine', tone: 'positive', points: unique.filter(point => point.grade > 0).sort((a, b) => b.grade - a.grade || a.title.localeCompare(b.title, 'fr')) },
    { label: 'Points de vigilance', tone: 'vigilance', points: unique.filter(point => point.grade <= 0).sort((a, b) => a.grade - b.grade || a.title.localeCompare(b.title, 'fr')) },
  ].filter(group => group.points.length);
}
