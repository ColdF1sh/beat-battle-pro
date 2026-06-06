import type { SoundLibraryCategory } from "@/lib/sound-library/categories";
import { scanGlobalLocalLibrary, type GlobalLocalSound } from "./local-library";
import { summarizeLibraryByCategory } from "./custom-pack-parser";

export type GeneratedSound = GlobalLocalSound & {
  slot: string;
};

export type GeneratedBattlePack = {
  seed: string;
  sounds: GeneratedSound[];
  summary: Record<string, number>;
  warnings: string[];
};

type GenerateBattlePackInput = {
  modeId: string;
  seed?: string;
};

const fallbackCategories: Partial<
  Record<SoundLibraryCategory, SoundLibraryCategory[]>
> = {
  SNARE: ["CLAP"],
  CLAP: ["SNARE"],
  BASS_808: ["BASS"],
  BASS: ["BASS_808"],
  HI_HAT: ["OPEN_HAT"],
  OPEN_HAT: ["HI_HAT"],
  SYNTH: ["KEY", "CHORD"],
  KEY: ["SYNTH", "CHORD"],
  CHORD: ["SYNTH", "KEY"],
  PLUCK: ["ARP"],
  ARP: ["PLUCK"],
};

function hashSeed(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: string) {
  let state = hashSeed(seed) || 1;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function chooseWeighted<T>(
  random: () => number,
  options: Array<{ value: T; weight: number }>,
) {
  const totalWeight = options.reduce((total, option) => total + option.weight, 0);
  let target = random() * totalWeight;

  for (const option of options) {
    target -= option.weight;

    if (target <= 0) {
      return option.value;
    }
  }

  return options[options.length - 1]?.value;
}

function buildSoundsByCategory(sounds: GlobalLocalSound[]) {
  return sounds.reduce<Map<SoundLibraryCategory, GlobalLocalSound[]>>(
    (map, sound) => {
      const categorySounds = map.get(sound.category) ?? [];
      categorySounds.push(sound);
      map.set(sound.category, categorySounds);

      return map;
    },
    new Map(),
  );
}

function isBulletMode(modeId: string) {
  return modeId === "beatmaking_bullet";
}

export function generateBattlePack({
  modeId,
  seed = `${modeId}:${Date.now()}`,
}: GenerateBattlePackInput): GeneratedBattlePack {
  const random = createSeededRandom(seed);
  const librarySounds = scanGlobalLocalLibrary();
  const soundsByCategory = buildSoundsByCategory(librarySounds);
  const warnings: string[] = [];
  const selectedSoundIds = new Set<string>();
  const selectedSounds: GeneratedSound[] = [];

  function pickSound(category: SoundLibraryCategory, slot: string) {
    const categoriesToTry = [category, ...(fallbackCategories[category] ?? [])];

    for (const categoryToTry of categoriesToTry) {
      const options = (soundsByCategory.get(categoryToTry) ?? []).filter(
        (sound) => !selectedSoundIds.has(sound.id),
      );

      if (options.length === 0) {
        continue;
      }

      const selected = options[Math.floor(random() * options.length)];
      selectedSoundIds.add(selected.id);
      selectedSounds.push({
        ...selected,
        slot,
      });

      if (categoryToTry !== category) {
        warnings.push(`Missing category: ${category}. Used ${categoryToTry}.`);
      }

      return;
    }

    warnings.push(`Missing category: ${category}`);
  }

  function addMelodyStack() {
    const usesLoop = random() < 0.1;

    if (usesLoop) {
      pickSound("LOOP", "Loop");
      pickSound("LEAD", "Lead");

      if (random() < 0.2) {
        pickSound(
          chooseWeighted(random, [
            { value: "PLUCK" as const, weight: 80 },
            { value: "ARP" as const, weight: 20 },
          ]),
          "Accent",
        );
      }

      return;
    }

    pickSound(
      chooseWeighted(random, [
        { value: "SYNTH" as const, weight: 45 },
        { value: "KEY" as const, weight: 45 },
        { value: "CHORD" as const, weight: 10 },
      ]),
      "Foundation",
    );
    pickSound("LEAD", "Lead");
    pickSound("PAD", "Pad");

    if (random() < 0.5) {
      pickSound(
        chooseWeighted(random, [
          { value: "PLUCK" as const, weight: 80 },
          { value: "ARP" as const, weight: 20 },
        ]),
        "Accent",
      );
    }
  }

  if (isBulletMode(modeId)) {
    pickSound("KICK", "Kick");
    pickSound("SNARE", "Snare");
    pickSound("HI_HAT", "Hi Hat");

    if (random() < 0.5) pickSound("CLAP", "Clap");
    if (random() < 0.3) pickSound("OPEN_HAT", "Open Hat");
    if (random() < 0.3) pickSound("PERC", "Perc");

    pickSound("FX", "FX");
  } else {
    pickSound("KICK", "Kick");
    pickSound("SNARE", "Snare");
    pickSound("CLAP", "Clap");
    pickSound("HI_HAT", "Hi Hat");
    pickSound("OPEN_HAT", "Open Hat");

    if (random() < 0.5) {
      pickSound(
        chooseWeighted(random, [
          { value: "PERC" as const, weight: 80 },
          { value: "VOX" as const, weight: 20 },
        ]),
        "Extra",
      );
    }

    pickSound("FX", "FX");
    if (random() < 0.35) pickSound("FX", "FX 2");
  }

  pickSound(
    chooseWeighted(random, [
      { value: "BASS_808" as const, weight: 75 },
      { value: "BASS" as const, weight: 25 },
    ]),
    "Low End",
  );
  addMelodyStack();

  return {
    seed,
    sounds: selectedSounds,
    summary: summarizeLibraryByCategory(selectedSounds),
    warnings: [...new Set(warnings)],
  };
}
