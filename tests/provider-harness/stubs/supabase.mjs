// Par défaut : indisponible (comportement historique du banc). Un test peut injecter un FAUX client (globalThis.__fakeSupabase) : toujours aucun réseau.
export const createClient = () => { if (globalThis.__fakeSupabase) return globalThis.__fakeSupabase; throw new Error('supabase indisponible dans le banc de test'); };
