import type { NoteBibleContext } from './bible-references';

/** Editorial identities, independent of display titles and file renaming in Directus. */
const profiles: Record<string, NoteBibleContext> = {
  '70b9ede4-bffe-4558-b98d-6dff010686cc': { translation: 'CRA', psalms: 'hebrew', modernKings: true, noteHeadings: 'crampon' },
  '94e52d29-20a5-47eb-bbad-ae90633c1534': { translation: 'GLA', noteHeadings: 'glaire' },
  '86f0f9de-c72d-418a-97c5-df9bffc9d83f': { translation: 'SAC' },
  'a758f0c9-c999-4d8a-ae1d-42f8a7c66c92': { pageMarkers: [363, 516] },
};
export const readerBibleProfile = (bookId: string): NoteBibleContext => profiles[bookId] || {};

/** In this Crampon EPUB, p053 starts Matthew and the NT notes use the traditional
 * numbering unless explicitly marked (héb.). The OT notes use Hebrew numbering.
 * Explicit markers in a citation always take precedence over this source context.
 */
export function bibleContextForSource(profile: NoteBibleContext, path: string): NoteBibleContext {
  const part = path.match(/(?:^|\/)p(\d{3})-/);
  return profile.translation === 'CRA' && part && Number(part[1]) >= 53 ? { ...profile, psalms: 'vulgate', modernKings: false } : profile;
}
