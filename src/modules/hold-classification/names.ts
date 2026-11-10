import catalog from '../../data/hold-catalog.json';

export interface LearnExample {
  src: string;
  credit: string;
  license: string;
  sourceUrl: string;
}
export interface CatalogEntry {
  id: string;
  name: string;
  grip: string;
  learn?: { mistake: string; footUse: string; examples?: LearnExample[] };
}

/**
 * Learn cards show their catalog example photos only while this is on. The old crops came from a
 * photo the site no longer serves (ADR-0002), so it is off; the owner's own crops turn it back on.
 */
export const LEARN_PHOTOS = false;

export const ENTRY = new Map<string, CatalogEntry>(
  (catalog as CatalogEntry[]).map((e) => [e.id, e]),
);
export const nameOf = (t: string) => ENTRY.get(t)?.name ?? t;
export const withArticle = (name: string) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
