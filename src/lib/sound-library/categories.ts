export const soundLibraryCategories = [
  "KICK",
  "SNARE",
  "CLAP",
  "HI_HAT",
  "OPEN_HAT",
  "PERC",
  "VOX",
  "FX",
  "BASS_808",
  "BASS",
  "SYNTH",
  "KEY",
  "CHORD",
  "LEAD",
  "PAD",
  "PLUCK",
  "ARP",
  "LOOP",
  "UNKNOWN",
] as const;

export type SoundLibraryCategory = (typeof soundLibraryCategories)[number];

const categoryAliases: Record<Exclude<SoundLibraryCategory, "UNKNOWN">, string[]> =
  {
    KICK: ["kick", "kicks"],
    SNARE: ["snare", "snares"],
    CLAP: ["clap", "claps"],
    HI_HAT: ["hi_hat", "hihat", "hats", "hat", "closed_hat", "chh"],
    OPEN_HAT: ["open_hat", "ohh"],
    PERC: ["perc", "percs", "percussion"],
    VOX: ["vox", "vocal", "vocals"],
    FX: ["fx", "sfx", "effects"],
    BASS_808: ["808", "808s"],
    BASS: ["bass", "basses"],
    SYNTH: ["synth", "synths"],
    KEY: ["key", "keys", "piano"],
    CHORD: ["chord", "chords"],
    LEAD: ["lead", "leads"],
    PAD: ["pad", "pads"],
    PLUCK: ["pluck", "plucks"],
    ARP: ["arp", "arps", "arpeggio"],
    LOOP: ["loop", "loops", "melody_loop", "melody", "melodies"],
  };

const aliasToCategory = new Map<string, SoundLibraryCategory>(
  Object.entries(categoryAliases).flatMap(([category, aliases]) =>
    aliases.map((alias) => [alias, category as SoundLibraryCategory]),
  ),
);

export function normalizeFolderName(folderName: string) {
  return folderName
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function detectSoundCategory(folderName: string): SoundLibraryCategory {
  return aliasToCategory.get(normalizeFolderName(folderName)) ?? "UNKNOWN";
}

export function getCategoryLabel(category: SoundLibraryCategory) {
  return category
    .toLowerCase()
    .split("_")
    .map((part) => (part === "808" ? "808" : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}
