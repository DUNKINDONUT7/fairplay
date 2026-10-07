// Multi-round contests (e.g. Elimination Round -> Semi-Finals -> Finals).
//
// The rounds themselves, and how many contestants advance from each, are set
// once in Create Event. Everything here reads that setup, so advancing a
// round never needs a number typed in by hand.
//
// Each score row is stamped with the round it was given in. A judge who
// re-scores a contestant in the next round overwrites their own row, so the
// stamp is what tells "this round" from "an earlier one" — and the results of
// every finished round are kept on the event itself (roundResults).

export function getRounds(event) {
  return Array.isArray(event?.rounds) && event.rounds.length >= 2 ? event.rounds : [];
}

export function isMultiRound(event) {
  return getRounds(event).length > 0;
}

export function getCurrentRoundIndex(event) {
  const rounds = getRounds(event);
  if (rounds.length === 0) return 0;
  return Math.min(Math.max(Number(event.currentRoundIndex) || 0, 0), rounds.length - 1);
}

export function getCurrentRound(event) {
  return getRounds(event)[getCurrentRoundIndex(event)] || null;
}

// '' for a single-round event, so nothing changes for those.
export function getCurrentRoundKey(event) {
  return getCurrentRound(event)?.id || '';
}

// Scores given before rounds were tracked carry no stamp; they belong to the
// first round.
export function getScoreRoundKey(score, event) {
  const stamped = score?.roundName || score?.round_name || '';
  if (stamped) return stamped;
  return getRounds(event)[0]?.id || '';
}

export function isCurrentRoundScore(score, event) {
  if (!isMultiRound(event)) return true;
  return getScoreRoundKey(score, event) === getCurrentRoundKey(event);
}

// Who goes through when the current round ends. `standings` is this round's
// ranking, best first. Anyone tied with the last qualifying score advances
// too — a tie is never broken by the order rows happen to be listed in.
export function planRoundAdvance(event, standings) {
  const rounds = getRounds(event);
  const index = getCurrentRoundIndex(event);
  const round = rounds[index] || null;
  const next = rounds[index + 1] || null;
  if (!round || !next) return null;

  const quota = Math.max(1, Number(round.advanceTo) || 0);
  const cutoff = standings[Math.min(quota, standings.length) - 1]?.averageScore;
  const advancing = standings.filter((row, position) => position < quota || row.averageScore === cutoff);
  const advancingIds = new Set(advancing.map((row) => String(row.contestantId)));
  const eliminated = standings.filter((row) => !advancingIds.has(String(row.contestantId)));

  return {
    round,
    next,
    quota,
    advancing,
    eliminated,
    tieAtCutoff: advancing.length > quota,
  };
}
