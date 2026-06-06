export type DraftCategoryId = "genre" | "bpm" | "key" | "duration";

export type DraftCategoryConfig = {
  id: DraftCategoryId;
  label: string;
  options: string[];
  banCountsBySlot: number[];
};

export const DRAFT_TURN_SECONDS = 10;

export const draftCategories = [
  {
    id: "genre",
    label: "Genre",
    options: ["Boom Bap", "Trap", "Drill", "R&B", "Experimental"],
    banCountsBySlot: [1, 1, 1, 1, 0],
  },
  {
    id: "bpm",
    label: "BPM",
    options: ["80 BPM", "95 BPM", "110 BPM", "130 BPM", "150 BPM"],
    banCountsBySlot: [0, 1, 1, 1, 1],
  },
  {
    id: "key",
    label: "Key",
    options: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
    banCountsBySlot: [2, 2, 2, 2, 3],
  },
  {
    id: "duration",
    label: "Duration",
    options: ["10 min", "15 min", "20 min", "30 min"],
    banCountsBySlot: [0, 0, 1, 1, 1],
  },
] satisfies DraftCategoryConfig[];

export const draftCategoryIds = draftCategories.map(
  (category) => category.id,
);

export function getDraftCategory(categoryId: string) {
  return draftCategories.find((category) => category.id === categoryId);
}

export function parseDurationOption(option: string) {
  return Number.parseInt(option, 10);
}
