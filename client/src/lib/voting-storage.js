const KEY = "carnavales.voting-session";

export function loadVotingState() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { scores: {}, confirmed: [] };
    const parsed = JSON.parse(raw);
    return {
      scores: parsed.scores || {},
      confirmed: Array.isArray(parsed.confirmed) ? parsed.confirmed : [],
    };
  } catch {
    return { scores: {}, confirmed: [] };
  }
}

export function saveVotingState(scores, confirmed) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ scores, confirmed }));
  } catch {
    // Silently ignore storage write failures (e.g. private mode).
  }
}

export function clearVotingState() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Ignore.
  }
}