/**
 * Golden-master snapshot data for pairing algorithm tests.
 *
 * Each snapshot captures the expected board pairings per round and the
 * final standings for a specific tournament configuration. If the pairing
 * engine ever produces different output for the same inputs, the
 * corresponding test will fail — acting as a safety net for refactors.
 */

export type RoundPairings = [string, string][]

export interface Snapshot {
  pairings: RoundPairings[]
  standings: { place: number; name: string; score: number }[]
}

// ── Base case: 8 players, higher-rated wins ─────────────────────────────

export const NS_8P_BASE: Snapshot = {
  pairings: [
    [
      ['Frej Stormöga', 'Thor Ödinson'],
      ['Tyr Svärdhand', 'Loki Läufeyson'],
      ['Freja Stjärnljus', 'Björn Järnsida'],
      ['Sigrid Nattskärm', 'Odin Åskväder'],
    ],
    [
      ['Thor Ödinson', 'Björn Järnsida'],
      ['Loki Läufeyson', 'Odin Åskväder'],
      ['Frej Stormöga', 'Freja Stjärnljus'],
      ['Tyr Svärdhand', 'Sigrid Nattskärm'],
    ],
    [
      ['Loki Läufeyson', 'Thor Ödinson'],
      ['Björn Järnsida', 'Frej Stormöga'],
      ['Odin Åskväder', 'Tyr Svärdhand'],
      ['Sigrid Nattskärm', 'Freja Stjärnljus'],
    ],
    [
      ['Thor Ödinson', 'Odin Åskväder'],
      ['Björn Järnsida', 'Loki Läufeyson'],
      ['Frej Stormöga', 'Sigrid Nattskärm'],
      ['Freja Stjärnljus', 'Tyr Svärdhand'],
    ],
    [
      ['Tyr Svärdhand', 'Thor Ödinson'],
      ['Loki Läufeyson', 'Frej Stormöga'],
      ['Sigrid Nattskärm', 'Björn Järnsida'],
      ['Odin Åskväder', 'Freja Stjärnljus'],
    ],
    [
      ['Thor Ödinson', 'Freja Stjärnljus'],
      ['Loki Läufeyson', 'Sigrid Nattskärm'],
      ['Björn Järnsida', 'Odin Åskväder'],
      ['Frej Stormöga', 'Tyr Svärdhand'],
    ],
    [
      ['Sigrid Nattskärm', 'Thor Ödinson'],
      ['Freja Stjärnljus', 'Loki Läufeyson'],
      ['Tyr Svärdhand', 'Björn Järnsida'],
      ['Odin Åskväder', 'Frej Stormöga'],
    ],
  ],
  standings: [
    {
      place: 1,
      name: 'Thor Ödinson',
      score: 7,
    },
    {
      place: 2,
      name: 'Loki Läufeyson',
      score: 6,
    },
    {
      place: 3,
      name: 'Björn Järnsida',
      score: 5,
    },
    {
      place: 4,
      name: 'Odin Åskväder',
      score: 4,
    },
    {
      place: 5,
      name: 'Frej Stormöga',
      score: 3,
    },
    {
      place: 6,
      name: 'Tyr Svärdhand',
      score: 2,
    },
    {
      place: 7,
      name: 'Freja Stjärnljus',
      score: 1,
    },
    {
      place: 8,
      name: 'Sigrid Nattskärm',
      score: 0,
    },
  ],
}

export const MONRAD_8P_BASE: Snapshot = {
  pairings: [
    [
      ['Loki Läufeyson', 'Thor Ödinson'],
      ['Odin Åskväder', 'Björn Järnsida'],
      ['Tyr Svärdhand', 'Frej Stormöga'],
      ['Sigrid Nattskärm', 'Freja Stjärnljus'],
    ],
    [
      ['Björn Järnsida', 'Thor Ödinson'],
      ['Freja Stjärnljus', 'Frej Stormöga'],
      ['Odin Åskväder', 'Loki Läufeyson'],
      ['Sigrid Nattskärm', 'Tyr Svärdhand'],
    ],
    [
      ['Frej Stormöga', 'Thor Ödinson'],
      ['Freja Stjärnljus', 'Björn Järnsida'],
      ['Tyr Svärdhand', 'Loki Läufeyson'],
      ['Sigrid Nattskärm', 'Odin Åskväder'],
    ],
    [
      ['Thor Ödinson', 'Freja Stjärnljus'],
      ['Björn Järnsida', 'Frej Stormöga'],
      ['Loki Läufeyson', 'Sigrid Nattskärm'],
      ['Odin Åskväder', 'Tyr Svärdhand'],
    ],
    [
      ['Thor Ödinson', 'Odin Åskväder'],
      ['Loki Läufeyson', 'Björn Järnsida'],
      ['Frej Stormöga', 'Sigrid Nattskärm'],
      ['Tyr Svärdhand', 'Freja Stjärnljus'],
    ],
    [
      ['Thor Ödinson', 'Tyr Svärdhand'],
      ['Frej Stormöga', 'Loki Läufeyson'],
      ['Björn Järnsida', 'Sigrid Nattskärm'],
      ['Freja Stjärnljus', 'Odin Åskväder'],
    ],
    [
      ['Sigrid Nattskärm', 'Thor Ödinson'],
      ['Freja Stjärnljus', 'Loki Läufeyson'],
      ['Tyr Svärdhand', 'Björn Järnsida'],
      ['Odin Åskväder', 'Frej Stormöga'],
    ],
  ],
  standings: [
    {
      place: 1,
      name: 'Thor Ödinson',
      score: 7,
    },
    {
      place: 2,
      name: 'Loki Läufeyson',
      score: 6,
    },
    {
      place: 3,
      name: 'Björn Järnsida',
      score: 5,
    },
    {
      place: 4,
      name: 'Odin Åskväder',
      score: 4,
    },
    {
      place: 5,
      name: 'Frej Stormöga',
      score: 3,
    },
    {
      place: 6,
      name: 'Tyr Svärdhand',
      score: 2,
    },
    {
      place: 7,
      name: 'Freja Stjärnljus',
      score: 1,
    },
    {
      place: 8,
      name: 'Sigrid Nattskärm',
      score: 0,
    },
  ],
}

export const BERGER_8P_BASE: Snapshot = {
  pairings: [
    [
      ['Thor Ödinson', 'Sigrid Nattskärm'],
      ['Odin Åskväder', 'Frej Stormöga'],
      ['Loki Läufeyson', 'Freja Stjärnljus'],
      ['Björn Järnsida', 'Tyr Svärdhand'],
    ],
    [
      ['Sigrid Nattskärm', 'Frej Stormöga'],
      ['Thor Ödinson', 'Loki Läufeyson'],
      ['Tyr Svärdhand', 'Odin Åskväder'],
      ['Freja Stjärnljus', 'Björn Järnsida'],
    ],
    [
      ['Loki Läufeyson', 'Sigrid Nattskärm'],
      ['Frej Stormöga', 'Tyr Svärdhand'],
      ['Björn Järnsida', 'Thor Ödinson'],
      ['Odin Åskväder', 'Freja Stjärnljus'],
    ],
    [
      ['Sigrid Nattskärm', 'Tyr Svärdhand'],
      ['Loki Läufeyson', 'Björn Järnsida'],
      ['Freja Stjärnljus', 'Frej Stormöga'],
      ['Thor Ödinson', 'Odin Åskväder'],
    ],
    [
      ['Björn Järnsida', 'Sigrid Nattskärm'],
      ['Tyr Svärdhand', 'Freja Stjärnljus'],
      ['Odin Åskväder', 'Loki Läufeyson'],
      ['Frej Stormöga', 'Thor Ödinson'],
    ],
    [
      ['Sigrid Nattskärm', 'Freja Stjärnljus'],
      ['Björn Järnsida', 'Odin Åskväder'],
      ['Thor Ödinson', 'Tyr Svärdhand'],
      ['Loki Läufeyson', 'Frej Stormöga'],
    ],
    [
      ['Odin Åskväder', 'Sigrid Nattskärm'],
      ['Freja Stjärnljus', 'Thor Ödinson'],
      ['Frej Stormöga', 'Björn Järnsida'],
      ['Tyr Svärdhand', 'Loki Läufeyson'],
    ],
  ],
  standings: [
    {
      place: 1,
      name: 'Thor Ödinson',
      score: 7,
    },
    {
      place: 2,
      name: 'Loki Läufeyson',
      score: 6,
    },
    {
      place: 3,
      name: 'Björn Järnsida',
      score: 5,
    },
    {
      place: 4,
      name: 'Odin Åskväder',
      score: 4,
    },
    {
      place: 5,
      name: 'Frej Stormöga',
      score: 3,
    },
    {
      place: 6,
      name: 'Tyr Svärdhand',
      score: 2,
    },
    {
      place: 7,
      name: 'Freja Stjärnljus',
      score: 1,
    },
    {
      place: 8,
      name: 'Sigrid Nattskärm',
      score: 0,
    },
  ],
}

// ── Odd players (7): bye handling ───────────────────────────────────────

export const NS_7P_ODD: Snapshot = {
  pairings: [
    [
      ['Odin Åskväder', 'Thor Ödinson'],
      ['Frej Stormöga', 'Loki Läufeyson'],
      ['Tyr Svärdhand', 'Björn Järnsida'],
      ['Freja Stjärnljus', '(bye)'],
    ],
    [
      ['Thor Ödinson', 'Björn Järnsida'],
      ['Loki Läufeyson', 'Freja Stjärnljus'],
      ['Odin Åskväder', 'Frej Stormöga'],
      ['Tyr Svärdhand', '(bye)'],
    ],
    [
      ['Loki Läufeyson', 'Thor Ödinson'],
      ['Björn Järnsida', 'Freja Stjärnljus'],
      ['Tyr Svärdhand', 'Odin Åskväder'],
      ['Frej Stormöga', '(bye)'],
    ],
    [
      ['Thor Ödinson', 'Frej Stormöga'],
      ['Björn Järnsida', 'Loki Läufeyson'],
      ['Freja Stjärnljus', 'Tyr Svärdhand'],
      ['Odin Åskväder', '(bye)'],
    ],
    [
      ['Thor Ödinson', 'Tyr Svärdhand'],
      ['Loki Läufeyson', 'Odin Åskväder'],
      ['Freja Stjärnljus', 'Frej Stormöga'],
      ['Björn Järnsida', '(bye)'],
    ],
    [
      ['Thor Ödinson', 'Freja Stjärnljus'],
      ['Björn Järnsida', 'Odin Åskväder'],
      ['Frej Stormöga', 'Tyr Svärdhand'],
      ['Loki Läufeyson', '(bye)'],
    ],
  ],
  standings: [
    {
      place: 1,
      name: 'Thor Ödinson',
      score: 6,
    },
    {
      place: 2,
      name: 'Loki Läufeyson',
      score: 5,
    },
    {
      place: 3,
      name: 'Björn Järnsida',
      score: 4,
    },
    {
      place: 4,
      name: 'Frej Stormöga',
      score: 3,
    },
    {
      place: 4,
      name: 'Odin Åskväder',
      score: 3,
    },
    {
      place: 6,
      name: 'Tyr Svärdhand',
      score: 2,
    },
    {
      place: 7,
      name: 'Freja Stjärnljus',
      score: 1,
    },
  ],
}

export const MONRAD_7P_ODD: Snapshot = {
  pairings: [
    [
      ['Loki Läufeyson', 'Thor Ödinson'],
      ['Odin Åskväder', 'Björn Järnsida'],
      ['Tyr Svärdhand', 'Frej Stormöga'],
      ['Freja Stjärnljus', '(bye)'],
    ],
    [
      ['Björn Järnsida', 'Thor Ödinson'],
      ['Frej Stormöga', 'Freja Stjärnljus'],
      ['Odin Åskväder', 'Loki Läufeyson'],
      ['Tyr Svärdhand', '(bye)'],
    ],
    [
      ['Thor Ödinson', 'Frej Stormöga'],
      ['Freja Stjärnljus', 'Björn Järnsida'],
      ['Loki Läufeyson', 'Tyr Svärdhand'],
      ['Odin Åskväder', '(bye)'],
    ],
    [
      ['Thor Ödinson', 'Freja Stjärnljus'],
      ['Björn Järnsida', 'Frej Stormöga'],
      ['Tyr Svärdhand', 'Odin Åskväder'],
      ['Loki Läufeyson', '(bye)'],
    ],
    [
      ['Thor Ödinson', 'Odin Åskväder'],
      ['Björn Järnsida', 'Loki Läufeyson'],
      ['Freja Stjärnljus', 'Tyr Svärdhand'],
      ['Frej Stormöga', '(bye)'],
    ],
    [
      ['Tyr Svärdhand', 'Thor Ödinson'],
      ['Frej Stormöga', 'Loki Läufeyson'],
      ['Freja Stjärnljus', 'Odin Åskväder'],
      ['Björn Järnsida', '(bye)'],
    ],
  ],
  standings: [
    {
      place: 1,
      name: 'Thor Ödinson',
      score: 6,
    },
    {
      place: 2,
      name: 'Loki Läufeyson',
      score: 5,
    },
    {
      place: 3,
      name: 'Björn Järnsida',
      score: 4,
    },
    {
      place: 4,
      name: 'Frej Stormöga',
      score: 3,
    },
    {
      place: 4,
      name: 'Odin Åskväder',
      score: 3,
    },
    {
      place: 6,
      name: 'Tyr Svärdhand',
      score: 2,
    },
    {
      place: 7,
      name: 'Freja Stjärnljus',
      score: 1,
    },
  ],
}

export const BERGER_7P_ODD: Snapshot = {
  pairings: [
    [
      ['Thor Ödinson', '(bye)'],
      ['Odin Åskväder', 'Frej Stormöga'],
      ['Loki Läufeyson', 'Freja Stjärnljus'],
      ['Björn Järnsida', 'Tyr Svärdhand'],
    ],
    [
      ['(bye)', 'Frej Stormöga'],
      ['Thor Ödinson', 'Loki Läufeyson'],
      ['Tyr Svärdhand', 'Odin Åskväder'],
      ['Freja Stjärnljus', 'Björn Järnsida'],
    ],
    [
      ['Loki Läufeyson', '(bye)'],
      ['Frej Stormöga', 'Tyr Svärdhand'],
      ['Björn Järnsida', 'Thor Ödinson'],
      ['Odin Åskväder', 'Freja Stjärnljus'],
    ],
    [
      ['(bye)', 'Tyr Svärdhand'],
      ['Loki Läufeyson', 'Björn Järnsida'],
      ['Freja Stjärnljus', 'Frej Stormöga'],
      ['Thor Ödinson', 'Odin Åskväder'],
    ],
    [
      ['Björn Järnsida', '(bye)'],
      ['Tyr Svärdhand', 'Freja Stjärnljus'],
      ['Odin Åskväder', 'Loki Läufeyson'],
      ['Frej Stormöga', 'Thor Ödinson'],
    ],
    [
      ['(bye)', 'Freja Stjärnljus'],
      ['Björn Järnsida', 'Odin Åskväder'],
      ['Thor Ödinson', 'Tyr Svärdhand'],
      ['Loki Läufeyson', 'Frej Stormöga'],
    ],
    [
      ['Odin Åskväder', '(bye)'],
      ['Freja Stjärnljus', 'Thor Ödinson'],
      ['Frej Stormöga', 'Björn Järnsida'],
      ['Tyr Svärdhand', 'Loki Läufeyson'],
    ],
  ],
  standings: [
    {
      place: 1,
      name: 'Thor Ödinson',
      score: 7,
    },
    {
      place: 2,
      name: 'Loki Läufeyson',
      score: 6,
    },
    {
      place: 3,
      name: 'Björn Järnsida',
      score: 5,
    },
    {
      place: 4,
      name: 'Odin Åskväder',
      score: 4,
    },
    {
      place: 5,
      name: 'Frej Stormöga',
      score: 2,
    },
    {
      place: 6,
      name: 'Tyr Svärdhand',
      score: 1,
    },
    {
      place: 7,
      name: 'Freja Stjärnljus',
      score: 0,
    },
  ],
}

// ── All draws: single giant score group ─────────────────────────────────
// NS can only pair 3 rounds with all draws (8 players same score → dead end at round 4)
// Monrad handles all 7 rounds

export const NS_8P_DRAWS: Snapshot = {
  pairings: [
    [
      ['Frej Stormöga', 'Thor Ödinson'],
      ['Tyr Svärdhand', 'Loki Läufeyson'],
      ['Freja Stjärnljus', 'Björn Järnsida'],
      ['Sigrid Nattskärm', 'Odin Åskväder'],
    ],
    [
      ['Thor Ödinson', 'Tyr Svärdhand'],
      ['Loki Läufeyson', 'Frej Stormöga'],
      ['Björn Järnsida', 'Sigrid Nattskärm'],
      ['Odin Åskväder', 'Freja Stjärnljus'],
    ],
    [
      ['Freja Stjärnljus', 'Thor Ödinson'],
      ['Sigrid Nattskärm', 'Loki Läufeyson'],
      ['Frej Stormöga', 'Björn Järnsida'],
      ['Tyr Svärdhand', 'Odin Åskväder'],
    ],
  ],
  standings: [
    {
      place: 1,
      name: 'Björn Järnsida',
      score: 1.5,
    },
    {
      place: 1,
      name: 'Loki Läufeyson',
      score: 1.5,
    },
    {
      place: 1,
      name: 'Sigrid Nattskärm',
      score: 1.5,
    },
    {
      place: 1,
      name: 'Freja Stjärnljus',
      score: 1.5,
    },
    {
      place: 1,
      name: 'Frej Stormöga',
      score: 1.5,
    },
    {
      place: 1,
      name: 'Tyr Svärdhand',
      score: 1.5,
    },
    {
      place: 1,
      name: 'Odin Åskväder',
      score: 1.5,
    },
    {
      place: 1,
      name: 'Thor Ödinson',
      score: 1.5,
    },
  ],
}

export const MONRAD_8P_DRAWS: Snapshot = {
  pairings: [
    [
      ['Loki Läufeyson', 'Thor Ödinson'],
      ['Odin Åskväder', 'Björn Järnsida'],
      ['Tyr Svärdhand', 'Frej Stormöga'],
      ['Sigrid Nattskärm', 'Freja Stjärnljus'],
    ],
    [
      ['Björn Järnsida', 'Thor Ödinson'],
      ['Odin Åskväder', 'Loki Läufeyson'],
      ['Freja Stjärnljus', 'Frej Stormöga'],
      ['Sigrid Nattskärm', 'Tyr Svärdhand'],
    ],
    [
      ['Thor Ödinson', 'Odin Åskväder'],
      ['Björn Järnsida', 'Loki Läufeyson'],
      ['Frej Stormöga', 'Sigrid Nattskärm'],
      ['Freja Stjärnljus', 'Tyr Svärdhand'],
    ],
    [
      ['Frej Stormöga', 'Thor Ödinson'],
      ['Tyr Svärdhand', 'Loki Läufeyson'],
      ['Freja Stjärnljus', 'Björn Järnsida'],
      ['Sigrid Nattskärm', 'Odin Åskväder'],
    ],
    [
      ['Thor Ödinson', 'Tyr Svärdhand'],
      ['Loki Läufeyson', 'Frej Stormöga'],
      ['Björn Järnsida', 'Sigrid Nattskärm'],
      ['Odin Åskväder', 'Freja Stjärnljus'],
    ],
    [
      ['Thor Ödinson', 'Freja Stjärnljus'],
      ['Loki Läufeyson', 'Sigrid Nattskärm'],
      ['Frej Stormöga', 'Björn Järnsida'],
      ['Tyr Svärdhand', 'Odin Åskväder'],
    ],
    [
      ['Sigrid Nattskärm', 'Thor Ödinson'],
      ['Freja Stjärnljus', 'Loki Läufeyson'],
      ['Tyr Svärdhand', 'Björn Järnsida'],
      ['Frej Stormöga', 'Odin Åskväder'],
    ],
  ],
  standings: [
    {
      place: 1,
      name: 'Björn Järnsida',
      score: 3.5,
    },
    {
      place: 1,
      name: 'Loki Läufeyson',
      score: 3.5,
    },
    {
      place: 1,
      name: 'Sigrid Nattskärm',
      score: 3.5,
    },
    {
      place: 1,
      name: 'Freja Stjärnljus',
      score: 3.5,
    },
    {
      place: 1,
      name: 'Frej Stormöga',
      score: 3.5,
    },
    {
      place: 1,
      name: 'Tyr Svärdhand',
      score: 3.5,
    },
    {
      place: 1,
      name: 'Odin Åskväder',
      score: 3.5,
    },
    {
      place: 1,
      name: 'Thor Ödinson',
      score: 3.5,
    },
  ],
}

// ── Withdrawal after round 2 ────────────────────────────────────────────
// Eva withdraws after round 2, leaving 7 players from round 3 onward.
// NS can pair 3 rounds total (rounds 1-2 with 8, round 3 with 7+bye, dead end at round 4)
// Monrad can pair 4 rounds total (rounds 1-2 with 8, rounds 3-4 with 7+bye, dead end at round 5)

export const NS_8P_WITHDRAW: Snapshot = {
  pairings: [
    [
      ['Frej Stormöga', 'Thor Ödinson'],
      ['Tyr Svärdhand', 'Loki Läufeyson'],
      ['Freja Stjärnljus', 'Björn Järnsida'],
      ['Sigrid Nattskärm', 'Odin Åskväder'],
    ],
    [
      ['Thor Ödinson', 'Björn Järnsida'],
      ['Loki Läufeyson', 'Odin Åskväder'],
      ['Frej Stormöga', 'Freja Stjärnljus'],
      ['Tyr Svärdhand', 'Sigrid Nattskärm'],
    ],
    [
      ['Loki Läufeyson', 'Thor Ödinson'],
      ['Björn Järnsida', 'Frej Stormöga'],
      ['Odin Åskväder', 'Tyr Svärdhand'],
      ['Freja Stjärnljus', '(bye)'],
    ],
  ],
  standings: [
    {
      place: 1,
      name: 'Thor Ödinson',
      score: 3,
    },
    {
      place: 2,
      name: 'Björn Järnsida',
      score: 2,
    },
    {
      place: 2,
      name: 'Loki Läufeyson',
      score: 2,
    },
    {
      place: 2,
      name: 'Odin Åskväder',
      score: 2,
    },
    {
      place: 5,
      name: 'Freja Stjärnljus',
      score: 1,
    },
    {
      place: 5,
      name: 'Frej Stormöga',
      score: 1,
    },
    {
      place: 5,
      name: 'Tyr Svärdhand',
      score: 1,
    },
    {
      place: 8,
      name: 'Sigrid Nattskärm',
      score: 0,
    },
  ],
}

export const MONRAD_8P_WITHDRAW: Snapshot = {
  pairings: [
    [
      ['Loki Läufeyson', 'Thor Ödinson'],
      ['Odin Åskväder', 'Björn Järnsida'],
      ['Tyr Svärdhand', 'Frej Stormöga'],
      ['Sigrid Nattskärm', 'Freja Stjärnljus'],
    ],
    [
      ['Björn Järnsida', 'Thor Ödinson'],
      ['Freja Stjärnljus', 'Frej Stormöga'],
      ['Odin Åskväder', 'Loki Läufeyson'],
      ['Sigrid Nattskärm', 'Tyr Svärdhand'],
    ],
    [
      ['Frej Stormöga', 'Thor Ödinson'],
      ['Freja Stjärnljus', 'Björn Järnsida'],
      ['Tyr Svärdhand', 'Loki Läufeyson'],
      ['Odin Åskväder', '(bye)'],
    ],
    [
      ['Thor Ödinson', 'Freja Stjärnljus'],
      ['Frej Stormöga', 'Odin Åskväder'],
      ['Loki Läufeyson', 'Björn Järnsida'],
      ['Tyr Svärdhand', '(bye)'],
    ],
  ],
  standings: [
    {
      place: 1,
      name: 'Thor Ödinson',
      score: 4,
    },
    {
      place: 2,
      name: 'Loki Läufeyson',
      score: 3,
    },
    {
      place: 3,
      name: 'Björn Järnsida',
      score: 2,
    },
    {
      place: 3,
      name: 'Frej Stormöga',
      score: 2,
    },
    {
      place: 3,
      name: 'Tyr Svärdhand',
      score: 2,
    },
    {
      place: 3,
      name: 'Odin Åskväder',
      score: 2,
    },
    {
      place: 7,
      name: 'Freja Stjärnljus',
      score: 1,
    },
    {
      place: 8,
      name: 'Sigrid Nattskärm',
      score: 0,
    },
  ],
}
