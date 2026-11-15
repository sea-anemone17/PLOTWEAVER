export type WikiLink = { label: string; targetId: string };
export type WikiDetails = { category: string; tags: string; status: string; links: WikiLink[] };
export const statNames = ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'] as const;
export type NpcProfile = {
  group: string; purpose: string; desire: string; fear: string; secret: string;
  knownClueIds: string[]; stats: Partial<Record<typeof statNames[number], number>>;
};
export const emptyNpc = (): NpcProfile => ({ group: '', purpose: '', desire: '', fear: '', secret: '', knownClueIds: [], stats: {} });

export function findWikiLinks(body: string, candidates: { id: string; title: string }[], previous: WikiLink[] = []) {
  const labels = new Set([...body.matchAll(/\[\[([^\[\]\n]+)\]\]/g)].map(match => match[1].trim()).filter(Boolean));
  return [...labels].map(label => {
    const old = previous.find(link => link.label === label);
    if (old?.targetId) return old;
    const matches = candidates.filter(note => note.title.trim() === label);
    return { label, targetId: matches.length === 1 ? matches[0].id : '' };
  });
}
