import { describe, expect, it } from "vitest";

import { chooseDisplayBpm, type BpmCandidate } from "@/lib/bpm-display";

const fixtures: Array<{
  name: string;
  expected: number;
  candidates: BpmCandidate[];
}> = [
  {
    name: "Beat54",
    expected: 160,
    candidates: [
      { bpm: 161.5, score: 31.2009 },
      { bpm: 107.67, score: 23.3004 },
      { bpm: 71.78, score: 15.18 },
      { bpm: 80.75, score: 12.6015 },
    ],
  },
  {
    name: "Beat61",
    expected: 86,
    candidates: [
      { bpm: 129.2, score: 29.2979 },
      { bpm: 86.13, score: 25.6564 },
      { bpm: 64.6, score: 14.8621 },
      { bpm: 171.8, score: 11.7543 },
    ],
  },
  {
    name: "Beat63",
    expected: 90,
    candidates: [
      { bpm: 89.1, score: 17.7576 },
      { bpm: 133.65, score: 14.0487 },
      { bpm: 178.21, score: 14.0455 },
      { bpm: 91.95, score: 10.9813 },
    ],
  },
  {
    name: "Beat59",
    expected: 144,
    candidates: [
      { bpm: 71.78, score: 28.0966 },
      { bpm: 143.55, score: 27.8469 },
      { bpm: 95.7, score: 25.874 },
      { bpm: 147.66, score: 6.7019 },
    ],
  },
  {
    name: "GXTCHA triplet pulse",
    expected: 140,
    candidates: [
      { bpm: 93.12, score: 16.9728 },
      { bpm: 139.67, score: 16.553 },
      { bpm: 69.84, score: 15.4242 },
      { bpm: 61.52, score: 13.0705 },
      { bpm: 138.43, score: 11.45 },
      { bpm: 184.57, score: 9.4503 },
      { bpm: 140.94, score: 9.2326 },
      { bpm: 92.29, score: 8.7267 },
    ],
  },
  {
    name: "Beat39 keeps direct mid tempo",
    expected: 110,
    candidates: [
      { bpm: 73.3, score: 28.9067 },
      { bpm: 164.94, score: 28.0962 },
      { bpm: 109.96, score: 25.0093 },
      { bpm: 147.66, score: 9.3505 },
      { bpm: 73.83, score: 8.2319 },
      { bpm: 145.58, score: 4.7329 },
      { bpm: 98.44, score: 4.2316 },
      { bpm: 110.74, score: 4.2279 },
    ],
  },
];

describe("chooseDisplayBpm", () => {
  for (const fixture of fixtures) {
    it(`chooses the rap display BPM for ${fixture.name}`, () => {
      const choice = chooseDisplayBpm(fixture.candidates);

      expect(Math.round(choice.bpm ?? 0)).toBe(fixture.expected);
    });
  }
});
