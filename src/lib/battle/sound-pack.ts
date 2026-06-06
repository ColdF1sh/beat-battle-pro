import type { Prisma } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";

import {
  analyzeAndCacheRapBeat,
  getPublicAudioFilePath,
} from "@/lib/audio-analysis";
import { prisma } from "@/lib/prisma";
import { generateBattlePack } from "@/lib/sound-library/generate-battle-pack";
import {
  type GlobalLocalRapBeat,
  scanGlobalLocalRapBeats,
  warnIfR2UsesLocalDemoAudio,
} from "@/lib/sound-library/local-library";

type SoundPackClient = Pick<
  Prisma.TransactionClient,
  | "soundPack"
  | "generatedBattlePack"
  | "generatedBattlePackSound"
  | "rapBeat"
  | "battleSubmission"
  | "battle"
  | "user"
>;

const rapBeatAnalysisInFlight = new Set<string>();
const rapBeatAnalysisFailuresLogged = new Set<string>();

export function isRapBattleMode(modeId: string) {
  return modeId.startsWith("rap_");
}

function getSeededIndex(seed: string, length: number) {
  return Math.abs(
    Array.from(seed).reduce(
      (hash, character) =>
        Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0,
      2166136261,
    ),
  ) % length;
}

function getSidecarProducerUsername(fileUrl: string) {
  const filePath = getPublicAudioFilePath(fileUrl);

  if (!filePath) {
    return null;
  }

  const sidecarPath = filePath.replace(/\.[^.]+$/, ".json");

  if (!existsSync(sidecarPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(sidecarPath, "utf8")) as {
      producerUsername?: unknown;
    };

    return typeof parsed.producerUsername === "string" &&
      parsed.producerUsername.trim()
      ? parsed.producerUsername.trim()
      : null;
  } catch {
    return null;
  }
}

export function selectRapBeatForSeed(seed: string) {
  const beats = scanGlobalLocalRapBeats();

  if (beats.length === 0) {
    return null;
  }

  return beats[getSeededIndex(seed, beats.length)] ?? null;
}

export async function selectPreparedRapBeatForBattle(seed: string) {
  const localBeats = scanGlobalLocalRapBeats();
  const localUrls = new Set(localBeats.map((beat) => beat.fileUrl));

  if (localBeats.length === 0) {
    return null;
  }

  const analyzedBeats = await prisma.rapBeat.findMany({
    where: {
      fileUrl: {
        in: Array.from(localUrls),
      },
      analysisStatus: "COMPLETE",
      detectedBpm: {
        not: null,
      },
    },
    select: {
      fileUrl: true,
      fileName: true,
    },
    orderBy: {
      fileUrl: "asc",
    },
  });

  const pool = analyzedBeats.length > 0 ? analyzedBeats : localBeats;
  const selected = pool[getSeededIndex(seed, pool.length)] ?? null;

  if (!selected) {
    return null;
  }

  const localBeat = localBeats.find((beat) => beat.fileUrl === selected.fileUrl);

  return (
    localBeat ?? {
      id: selected.fileUrl,
      fileName: selected.fileName,
      fileUrl: selected.fileUrl,
      sizeBytes: 0,
      mimeType: "audio/mpeg",
    }
  );
}

export function queueRapBeatAnalysis(rapBeatId: string) {
  if (rapBeatAnalysisInFlight.has(rapBeatId)) {
    return;
  }

  rapBeatAnalysisInFlight.add(rapBeatId);
  console.info("Queueing rap beat analysis", {
    rapBeatId,
  });

  void analyzeAndCacheRapBeat(prisma, rapBeatId)
    .catch((error) => {
      if (!rapBeatAnalysisFailuresLogged.has(rapBeatId)) {
        rapBeatAnalysisFailuresLogged.add(rapBeatId);
        console.warn(`Rap beat analysis failed for ${rapBeatId}`, error);
      }
    })
    .finally(() => {
      rapBeatAnalysisInFlight.delete(rapBeatId);
    });
}

export function queueRapBeatAnalysisForBattle(battleId: string) {
  void prisma.battle
    .findUnique({
      where: {
        id: battleId,
      },
      select: {
        rapBeatId: true,
      },
    })
    .then((battle) => {
      if (battle?.rapBeatId) {
        queueRapBeatAnalysis(battle.rapBeatId);
      }
    })
    .catch((error) => {
      console.warn(`Could not queue rap beat analysis for battle ${battleId}`, error);
    });
}

export async function findRandomActiveSoundPackId(client: SoundPackClient) {
  const soundPackCount = await client.soundPack.count({
    where: {
      isActive: true,
      sounds: {
        some: {},
      },
    },
  });

  if (soundPackCount === 0) {
    return null;
  }

  const soundPack = await client.soundPack.findFirst({
    where: {
      isActive: true,
      sounds: {
        some: {},
      },
    },
    select: {
      id: true,
    },
    skip: Math.floor(Math.random() * soundPackCount),
  });

  return soundPack?.id ?? null;
}

export async function ensureGeneratedBattlePack(
  client: SoundPackClient,
  {
    battleId,
    modeId,
    seed,
  }: {
    battleId: string;
    modeId: string;
    seed?: string;
  },
) {
  const existingPack = await client.generatedBattlePack.findUnique({
    where: {
      battleId,
    },
    select: {
      id: true,
    },
  });

  if (existingPack) {
    return existingPack.id;
  }

  const generatedPack = generateBattlePack({
    modeId,
    seed: seed ?? `${battleId}:${modeId}`,
  });
  for (const sound of generatedPack.sounds) {
    warnIfR2UsesLocalDemoAudio(sound.fileUrl, "generated-battle-pack");
  }

  const createdPack = await client.generatedBattlePack.create({
    data: {
      battleId,
      seed: generatedPack.seed,
      sourceType: "GLOBAL_LIBRARY",
      sounds: {
        create: generatedPack.sounds.map((sound) => ({
          fileUrl: sound.fileUrl,
          fileName: sound.fileName,
          category: sound.category,
          source: sound.source,
          originalFileName: sound.originalFileName,
          mimeType: sound.mimeType,
          sizeBytes: sound.sizeBytes,
          slot: sound.slot,
        })),
      },
    },
    select: {
      id: true,
    },
  });

  if (generatedPack.warnings.length > 0) {
    console.warn(
      `Generated battle pack ${createdPack.id} warnings: ${generatedPack.warnings.join(", ")}`,
    );
  }

  return createdPack.id;
}

export async function ensureRapBeatForBattle(
  client: SoundPackClient,
  {
    battleId,
    seed = battleId,
    selectedBeat,
    allowFilesystemScan = true,
  }: {
    battleId: string;
    seed?: string;
    selectedBeat?: GlobalLocalRapBeat | null;
    allowFilesystemScan?: boolean;
  },
) {
  const existingBattle = await client.battle.findUnique({
    where: {
      id: battleId,
    },
    select: {
      rapBeatId: true,
      rapBeat: {
        select: {
          fileUrl: true,
        },
      },
    },
  });

  if (
    existingBattle?.rapBeatId &&
    existingBattle.rapBeat?.fileUrl
  ) {
    warnIfR2UsesLocalDemoAudio(existingBattle.rapBeat.fileUrl, "existing-rap-beat");
    return existingBattle.rapBeatId;
  }

  const beat = selectedBeat ?? (allowFilesystemScan ? selectRapBeatForSeed(seed) : null);

  if (!beat) {
    console.warn(
      `No rap beats found in public/demo-audio/Global Library/Beat for battle ${battleId}.`,
    );
    return null;
  }

  const sidecarProducerUsername = getSidecarProducerUsername(beat.fileUrl);
  warnIfR2UsesLocalDemoAudio(beat.fileUrl, "selected-rap-beat");
  const producerUsername = sidecarProducerUsername ?? "test_user";
  const producer = await client.user.findUnique({
    where: {
      username: producerUsername,
    },
    select: {
      username: true,
      avatarUrl: true,
      producerElo: true,
      producerWins: true,
      producerGames: true,
    },
  });
  const producerMetadata = producer
    ? {
        producerUsername: producer.username,
        producerAvatarUrl: producer.avatarUrl,
        producerElo: producer.producerElo,
        producerWins: producer.producerWins,
        producerGames: producer.producerGames,
      }
    : {
        producerUsername,
        producerAvatarUrl: null,
        producerElo: null,
        producerWins: null,
        producerGames: null,
      };
  const rapBeat = await client.rapBeat.upsert({
    where: {
      fileUrl: beat.fileUrl,
    },
    update: {
      fileName: beat.fileName,
      title: beat.fileName,
      ...producerMetadata,
    },
    create: {
      fileUrl: beat.fileUrl,
      fileName: beat.fileName,
      title: beat.fileName,
      ...producerMetadata,
    },
    select: {
      id: true,
    },
  });

  await client.battle.update({
    where: {
      id: battleId,
    },
    data: {
      rapBeatId: rapBeat.id,
    },
  });

  return rapBeat.id;
}

export async function prepareRapBeatForBattle(battleId: string) {
  const battle = await prisma.battle.findUnique({
    where: {
      id: battleId,
    },
    select: {
      id: true,
      mode: true,
      rapBeatId: true,
      rapBeat: {
        select: {
          id: true,
          fileUrl: true,
          analysisStatus: true,
          detectedBpm: true,
          detectedKey: true,
        },
      },
    },
  });

  if (!battle || !isRapBattleMode(battle.mode)) {
    return null;
  }

  if (
    battle.rapBeatId &&
    battle.rapBeat?.fileUrl
  ) {
    warnIfR2UsesLocalDemoAudio(battle.rapBeat.fileUrl, "prepared-rap-beat");
    if (
      battle.rapBeat.analysisStatus !== "COMPLETE" ||
      (battle.rapBeat.detectedBpm === null && !battle.rapBeat.detectedKey)
    ) {
      queueRapBeatAnalysis(battle.rapBeatId);
    }

    return battle.rapBeatId;
  }

  const selectedBeat = await selectPreparedRapBeatForBattle(
    `${battle.id}:${battle.mode}`,
  );

  if (!selectedBeat) {
    return null;
  }

  const rapBeatId = await prisma.$transaction(async (tx) =>
    ensureRapBeatForBattle(tx, {
      battleId: battle.id,
      seed: `${battle.id}:${battle.mode}`,
      selectedBeat,
      allowFilesystemScan: false,
    }),
  );

  if (rapBeatId) {
    queueRapBeatAnalysis(rapBeatId);
  }

  return rapBeatId;
}

export async function ensureBattleAudioSource(
  client: SoundPackClient,
  {
    battleId,
    modeId,
    seed,
    selectedRapBeat,
    allowRapBeatFilesystemScan,
  }: {
    battleId: string;
    modeId: string;
    seed?: string;
    selectedRapBeat?: GlobalLocalRapBeat | null;
    allowRapBeatFilesystemScan?: boolean;
  },
) {
  if (isRapBattleMode(modeId)) {
    return ensureRapBeatForBattle(client, {
      battleId,
      seed: seed ?? `${battleId}:${modeId}`,
      selectedBeat: selectedRapBeat,
      allowFilesystemScan: allowRapBeatFilesystemScan,
    });
  }

  return ensureGeneratedBattlePack(client, {
    battleId,
    modeId,
    seed,
  });
}
