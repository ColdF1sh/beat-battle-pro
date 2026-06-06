import { getCategoryLabel } from "@/lib/sound-library/categories";
import { generateBattlePack } from "@/lib/sound-library/generate-battle-pack";
import { scanGlobalLocalLibrary } from "@/lib/sound-library/local-library";
import { summarizeLibraryByCategory } from "@/lib/sound-library/custom-pack-parser";

const exampleModes = [
  "beatmaking_bullet",
  "beatmaking_free_flying",
  "beatmaking_strict",
] as const;

const sounds = scanGlobalLocalLibrary();
const summary = summarizeLibraryByCategory(sounds);

console.log("Global Sound Library");
console.log("====================");
console.log(`Total sounds: ${sounds.length}`);
console.log("");
console.log("Category counts:");

for (const [category, count] of Object.entries(summary).sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  console.log(`- ${category}: ${count}`);
}

for (const modeId of exampleModes) {
  const pack = generateBattlePack({
    modeId,
    seed: `dev-test:${modeId}`,
  });

  console.log("");
  console.log(`Generated pack: ${modeId}`);
  console.log("-----------------------------");
  console.log(`Seed: ${pack.seed}`);

  for (const sound of pack.sounds) {
    console.log(
      `- ${sound.slot}: ${getCategoryLabel(sound.category)} / ${sound.originalFileName}`,
    );
  }

  if (pack.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of pack.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}
