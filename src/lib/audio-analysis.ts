import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { Prisma } from "@prisma/client";

import {
  normalizeKeyName,
  normalizeTempoCandidates,
  type AudioRuleAnalysis,
} from "@/lib/rule-compliance";

const execFileAsync = promisify(execFile);
const ANALYZER_TIMEOUT_MS = 120_000;
const DOCKER_ANALYZER_TIMEOUT_MS = 180_000;
const FAILED_ANALYSIS_RETRY_MS = 60_000;
export const AUDIO_ANALYSIS_VERSION = "mir-v5.3-optional-keyfinder";

export type AudioAnalysisResult = AudioRuleAnalysis & {
  source: "manual" | "essentia" | "fallback" | "consensus" | "auto";
  analysisVersion?: string;
  analysisMode?: "fast" | "full" | "debug";
  analysisStage?: "fast" | "full" | "staged";
  timings?: Record<string, number | string>;
  beatGridConfidence?: number;
  referenceAHz?: number | null;
  keyCertainty?: "DETECTED" | "POSSIBLE" | "UNKNOWN";
  bpmCandidates?: Array<{
    bpm: number;
    score: number;
    normalizedBpm?: number;
    arrangementGridScore?: number;
    beatGridScore?: number;
    labels?: string[];
    methods?: string[];
    reasons?: string[];
    sectionBoundaries?: number[];
  }>;
  keyCandidates?: Array<{
    key: string;
    mode: "major" | "minor";
    confidence: number;
    score?: number;
    methods?: string[];
    sources?: string[];
  }>;
};
type AudioAnalysisWithMetadata = AudioAnalysisResult;

type AudioAnalysisClient = Pick<
  Prisma.TransactionClient,
  "rapBeat" | "battleSubmission"
>;

function coerceNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coerceConfidence(value: unknown) {
  const number = coerceNumber(value);

  if (number === null) {
    return 0;
  }

  return Math.min(1, Math.max(0, number));
}

function coerceMode(value: unknown): "major" | "minor" | null {
  return value === "major" || value === "minor" ? value : null;
}

function coerceSource(value: unknown): AudioAnalysisResult["source"] {
  if (
    value === "manual" ||
    value === "essentia" ||
    value === "fallback" ||
    value === "consensus"
  ) {
    return value;
  }

  return "auto";
}

function coerceTuningCents(value: unknown) {
  const number = coerceNumber(value);

  return number === null ? null : Math.round(number * 100) / 100;
}

function coerceKeyCertainty(value: unknown): "DETECTED" | "POSSIBLE" | "UNKNOWN" {
  if (value === "DETECTED" || value === "POSSIBLE" || value === "UNKNOWN") {
    return value;
  }
  return "UNKNOWN";
}

export function getAudioHash(audioFilePath: string) {
  return createHash("sha256").update(readFileSync(audioFilePath)).digest("hex");
}

function parseAnalysis(stdout: string): AudioAnalysisWithMetadata | null {
  try {
    const jsonLine = stdout
      .trim()
      .split(/\r?\n/)
      .reverse()
      .find((line) => line.trim().startsWith("{"));

    if (!jsonLine) {
      return null;
    }

    const parsed = JSON.parse(jsonLine) as Record<string, unknown>;
    const bpm = coerceNumber(parsed.bpm);
    const key = normalizeKeyName(
      typeof parsed.key === "string" ? parsed.key : null,
    );

    const bpmCandidates = Array.isArray(parsed.bpmCandidates)
      ? parsed.bpmCandidates
          .map((candidate) => {
            if (!candidate || typeof candidate !== "object") {
              return null;
            }

            const item = candidate as Record<string, unknown>;
            const candidateBpm = coerceNumber(item.bpm);
            const score = coerceNumber(item.score);
            const normalizedBpm = coerceNumber(item.normalizedBpm);
            const arrangementGridScore = coerceNumber(item.arrangementGridScore);
            const beatGridScore = coerceNumber(item.beatGridScore);
            const labels = Array.isArray(item.labels)
              ? item.labels.filter((label): label is string => typeof label === "string")
              : undefined;
            const methods = Array.isArray(item.methods)
              ? item.methods.filter((method): method is string => typeof method === "string")
              : undefined;
            const reasons = Array.isArray(item.reasons)
              ? item.reasons.filter((reason): reason is string => typeof reason === "string")
              : undefined;
            const sectionBoundaries = Array.isArray(item.sectionBoundaries)
              ? item.sectionBoundaries.filter(
                  (boundary): boundary is number =>
                    typeof boundary === "number" && Number.isFinite(boundary),
                )
              : undefined;

            return candidateBpm !== null
              ? {
                  bpm: candidateBpm,
                  score: score ?? 0,
                  normalizedBpm: normalizedBpm ?? undefined,
                  arrangementGridScore: arrangementGridScore ?? undefined,
                  beatGridScore: beatGridScore ?? undefined,
                  labels,
                  methods,
                  reasons,
                  sectionBoundaries,
                }
              : null;
          })
          .filter(Boolean)
      : [];
    const keyCandidates = Array.isArray(parsed.keyCandidates)
      ? parsed.keyCandidates
          .map((candidate) => {
            if (!candidate || typeof candidate !== "object") {
              return null;
            }

            const item = candidate as Record<string, unknown>;
            const candidateKey = normalizeKeyName(
              typeof item.key === "string" ? item.key : null,
            );
            const candidateMode = coerceMode(item.mode);
            const methods = Array.isArray(item.methods)
              ? item.methods.filter((method): method is string => typeof method === "string")
              : undefined;
            const sources = Array.isArray(item.sources)
              ? item.sources.filter((source): source is string => typeof source === "string")
              : undefined;

            return candidateKey && candidateMode
              ? {
                  key: candidateKey,
                  mode: candidateMode,
                  confidence: coerceConfidence(item.confidence),
                  score: coerceNumber(item.score) ?? undefined,
                  methods,
                  sources,
                }
              : null;
          })
          .filter(Boolean)
      : [];

    return {
      bpm,
      bpmConfidence: coerceConfidence(parsed.bpmConfidence),
      analysisVersion:
        typeof parsed.analysisVersion === "string"
          ? parsed.analysisVersion
          : undefined,
      analysisMode:
        parsed.analysisMode === "fast" ||
        parsed.analysisMode === "full" ||
        parsed.analysisMode === "debug"
          ? parsed.analysisMode
          : undefined,
      analysisStage:
        parsed.analysisStage === "fast" ||
        parsed.analysisStage === "full" ||
        parsed.analysisStage === "staged"
          ? parsed.analysisStage
          : undefined,
      timings:
        parsed.timings && typeof parsed.timings === "object"
          ? (parsed.timings as Record<string, number | string>)
          : undefined,
      beatGridConfidence: coerceConfidence(parsed.beatGridConfidence),
      referenceAHz: coerceNumber(parsed.referenceAHz),
      key,
      mode: coerceMode(parsed.mode),
      keyConfidence: coerceConfidence(parsed.keyConfidence),
      keyCertainty: coerceKeyCertainty(parsed.keyCertainty),
      tuningCents: coerceTuningCents(parsed.tuningCents),
      source: coerceSource(parsed.source),
      bpmCandidates: bpmCandidates as AudioAnalysisWithMetadata["bpmCandidates"],
      keyCandidates: keyCandidates as AudioAnalysisWithMetadata["keyCandidates"],
    };
  } catch {
    return null;
  }
}

export function getPublicAudioFilePath(fileUrl: string) {
  if (/^https?:\/\//i.test(fileUrl)) {
    return null;
  }

  const pathname = decodeURIComponent(fileUrl.split("?")[0] ?? "");
  const normalizedPathname = pathname.replace(/^\/+/, "");
  const filePath = path.join(process.cwd(), "public", normalizedPathname);

  if (!existsSync(filePath)) {
    console.warn("Audio analysis file path missing", {
      fileUrl,
      filePath,
    });
    return null;
  }

  return filePath;
}

function readSidecarMetadata(audioFilePath: string): AudioAnalysisWithMetadata | null {
  const sidecarPath = audioFilePath.replace(/\.[^.]+$/, ".json");

  if (!existsSync(sidecarPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(sidecarPath, "utf8")) as Record<
      string,
      unknown
    >;
    const bpm = coerceNumber(parsed.bpm);
    const key = normalizeKeyName(typeof parsed.key === "string" ? parsed.key : null);
    const mode = coerceMode(parsed.mode);

    if (bpm === null && !key) {
      return null;
    }

    console.info("Audio analysis sidecar override found", {
      sidecarPath,
      bpm,
      key,
      mode,
    });

    return {
      bpm,
      bpmConfidence: bpm !== null ? 1 : 0,
      analysisVersion: AUDIO_ANALYSIS_VERSION,
      beatGridConfidence: bpm !== null ? 1 : 0,
      referenceAHz: coerceNumber(parsed.referenceAHz),
      key,
      mode,
      keyConfidence: key ? 1 : 0,
      keyCertainty: key ? "DETECTED" : "UNKNOWN",
      tuningCents: coerceTuningCents(parsed.tuningCents),
      source: "manual",
      bpmCandidates: bpm !== null ? [{ bpm, score: 1 }] : [],
      keyCandidates:
        key && mode ? [{ key, mode, confidence: 1, score: 1 }] : [],
    };
  } catch (error) {
    console.warn("Audio analysis sidecar could not be parsed", {
      sidecarPath,
      error,
    });
    return null;
  }
}

async function runAnalyzerWithCommand(command: string, audioFilePath: string) {
  const scriptPath = path.join(
    process.cwd(),
    "scripts",
    "analyze-audio-key-bpm.py",
  );

  try {
    const { stdout } = await execFileAsync(command, [scriptPath, audioFilePath], {
      timeout: ANALYZER_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    return parseAnalysis(stdout);
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error
        ? String((error as { stdout?: unknown }).stdout ?? "")
        : "";
    const parsed = parseAnalysis(stdout);

    if (parsed) {
      console.warn("Audio analyzer returned JSON before process exit failure", {
        command,
        audioFilePath,
      });
      return parsed;
    }

    throw error;
  }
}

function getDockerAudioFilePath(audioFilePath: string) {
  const demoAudioRoot = path.join(process.cwd(), "public", "demo-audio");
  const relativePath = path.relative(demoAudioRoot, audioFilePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return `/app/public/demo-audio/${relativePath.split(path.sep).join("/")}`;
}

async function ensureDockerAnalyzerService() {
  const url = process.env.ANALYZER_SERVICE_URL ?? "http://127.0.0.1:8765";

  try {
    const health = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    if (health.ok) {
      return url;
    }
  } catch {
    // Start below.
  }

  await execFileAsync(
    "docker",
    ["compose", "--profile", "tools", "up", "-d", "analyzer"],
    {
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const health = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(1_500),
      });
      if (health.ok) {
        return url;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error("Docker analyzer service did not become healthy");
}

type AnalyzerRunMode = "fast" | "full" | "debug";
type AnalyzerRequestMode = AnalyzerRunMode | "staged";

async function runDockerAnalyzerService(
  audioFilePath: string,
  mode: AnalyzerRunMode,
) {
  if (process.env.DISABLE_ANALYZER_SERVICE === "true") {
    return null;
  }

  const dockerAudioFilePath = getDockerAudioFilePath(audioFilePath);

  if (!dockerAudioFilePath) {
    return null;
  }

  const serviceUrl = await ensureDockerAnalyzerService();
  const response = await fetch(`${serviceUrl}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filePath: dockerAudioFilePath,
      mode,
    }),
    signal: AbortSignal.timeout(DOCKER_ANALYZER_TIMEOUT_MS),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Analyzer service failed (${response.status}): ${text.slice(0, 800)}`);
  }

  return parseAnalysis(text);
}

function candidateSupportsSelected(candidateBpm: number, selectedBpm: number) {
  const variants = normalizeTempoCandidates(candidateBpm);
  return variants.some((value) => Math.abs(value - selectedBpm) <= 3);
}

function hasConflictingBpmClass(result: AudioAnalysisWithMetadata) {
  const selectedBpm = result.bpm;
  const candidates = result.bpmCandidates ?? [];

  if (selectedBpm === null || candidates.length < 2) {
    return false;
  }

  const strongest = candidates[0]?.score ?? 0;
  if (strongest <= 0) {
    return true;
  }

  return candidates.slice(1, 6).some((candidate) => {
    if (candidateSupportsSelected(candidate.bpm, selectedBpm)) {
      return false;
    }
    return candidate.score >= strongest * 0.58;
  });
}

function shouldAcceptFastAnalysis(result: AudioAnalysisWithMetadata) {
  return Boolean(
    result.bpm !== null &&
      result.bpmConfidence >= 0.75 &&
      !hasConflictingBpmClass(result),
  );
}

async function runStagedDockerAnalyzerService(audioFilePath: string) {
  const fastStarted = Date.now();
  const fastResult = await runDockerAnalyzerService(audioFilePath, "fast");
  const fastMs = Date.now() - fastStarted;

  if (fastResult && shouldAcceptFastAnalysis(fastResult)) {
    return {
      ...fastResult,
      analysisStage: "fast" as const,
      timings: {
        ...(fastResult.timings ?? {}),
        stagedFastMs: fastMs,
        stagedDecision: "fast-accepted",
      },
    } satisfies AudioAnalysisWithMetadata;
  }

  const fullStarted = Date.now();
  const fullResult = await runDockerAnalyzerService(audioFilePath, "full");
  const fullMs = Date.now() - fullStarted;

  if (!fullResult) {
    return fastResult;
  }

  return {
    ...fullResult,
    analysisStage: "full" as const,
    timings: {
      ...(fullResult.timings ?? {}),
      stagedFastMs: fastMs,
      stagedFullMs: fullMs,
      stagedDecision: fastResult
        ? "full-after-ambiguous-fast"
        : "full-after-fast-empty",
      fastBpm: fastResult?.bpm ?? "none",
      fastBpmConfidence: fastResult?.bpmConfidence ?? 0,
      fastLoadMs: fastResult?.timings?.loadMs ?? "none",
      fastBpmMs: fastResult?.timings?.fastBpmMs ?? "none",
      fastTotalMs: fastResult?.timings?.totalMs ?? "none",
    },
  } satisfies AudioAnalysisWithMetadata;
}

async function runDockerAnalyzer(audioFilePath: string) {
  if (process.env.DISABLE_DOCKER_AUDIO_ANALYZER === "true") {
    return null;
  }

  const demoAudioRoot = path.join(process.cwd(), "public", "demo-audio");
  const dockerAudioFilePath = getDockerAudioFilePath(audioFilePath);

  if (!dockerAudioFilePath) {
    console.warn("Docker audio analysis skipped for non-demo-audio path", {
      audioFilePath,
    });
    return null;
  }

  console.info("Docker Essentia audio analysis started", {
    hostFilePath: audioFilePath,
    containerFilePath: dockerAudioFilePath,
  });

  try {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "compose",
        "run",
        "--rm",
        "-v",
        `${demoAudioRoot}:/app/public/demo-audio:ro`,
        "analyzer",
        "python",
        "scripts/analyze-audio-key-bpm.py",
        dockerAudioFilePath,
      ],
      {
        timeout: DOCKER_ANALYZER_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );

    return parseAnalysis(stdout);
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error
        ? String((error as { stdout?: unknown }).stdout ?? "")
        : "";
    const parsed = parseAnalysis(stdout);

    if (parsed) {
      console.warn(
        "Docker Essentia analyzer returned JSON before process exit failure",
        {
          hostFilePath: audioFilePath,
          containerFilePath: dockerAudioFilePath,
        },
      );
      return parsed;
    }

    throw error;
  }
}

export async function analyzeAudioFile(
  audioFilePath: string,
  requestMode: AnalyzerRequestMode = "staged",
) {
  if (!existsSync(audioFilePath)) {
    console.warn("Audio analysis skipped because file does not exist", {
      audioFilePath,
    });
    return null;
  }

  const sidecarResult = readSidecarMetadata(audioFilePath);

  if (sidecarResult) {
    return sidecarResult;
  }

  console.info("Audio analysis started", {
    filePath: audioFilePath,
  });

  try {
    const analyzerMode =
      process.env.ANALYZER_MODE === "fast" ||
      process.env.ANALYZER_MODE === "full" ||
      process.env.ANALYZER_MODE === "debug"
        ? (process.env.ANALYZER_MODE as AnalyzerRunMode)
        : requestMode;
    const serviceResult =
      analyzerMode === "staged"
        ? await runStagedDockerAnalyzerService(audioFilePath)
        : await runDockerAnalyzerService(audioFilePath, analyzerMode);

    if (serviceResult) {
      console.info("Docker Essentia analyzer service completed", {
        filePath: audioFilePath,
        stage: serviceResult.analysisStage,
        bpm: serviceResult.bpm,
        key: serviceResult.key,
        mode: serviceResult.mode,
        bpmConfidence: serviceResult.bpmConfidence,
        keyConfidence: serviceResult.keyConfidence,
        timings: serviceResult.timings,
      });
      return serviceResult;
    }
  } catch (error) {
    console.warn("Docker analyzer service failed, falling back:", error);
  }

  try {
    const dockerResult = await runDockerAnalyzer(audioFilePath);

    if (dockerResult) {
      console.info("Docker Essentia audio analysis completed", {
        filePath: audioFilePath,
        bpm: dockerResult.bpm,
        key: dockerResult.key,
        mode: dockerResult.mode,
        bpmConfidence: dockerResult.bpmConfidence,
        beatGridConfidence: dockerResult.beatGridConfidence,
        keyConfidence: dockerResult.keyConfidence,
        tuningCents: dockerResult.tuningCents,
        source: dockerResult.source,
        bpmCandidates: dockerResult.bpmCandidates,
        keyCandidates: dockerResult.keyCandidates,
      });
      return dockerResult;
    }
  } catch (error) {
    console.warn("Docker Essentia audio analyzer failed, falling back:", error);
  }

  const commands = [process.env.PYTHON, "python", "py"].filter(
    Boolean,
  ) as string[];

  for (const command of commands) {
    try {
      const result = await runAnalyzerWithCommand(command, audioFilePath);

      if (result) {
        console.info("Audio analysis completed", {
          filePath: audioFilePath,
          command,
          bpm: result.bpm,
          key: result.key,
          mode: result.mode,
          bpmConfidence: result.bpmConfidence,
          beatGridConfidence: result.beatGridConfidence,
          keyConfidence: result.keyConfidence,
          tuningCents: result.tuningCents,
          bpmCandidates: result.bpmCandidates,
          keyCandidates: result.keyCandidates,
        });
        return result;
      }
    } catch (error) {
      console.warn(`Audio analyzer failed with ${command}:`, error);
    }
  }

  console.warn("Audio analysis failed with every available Python command", {
    filePath: audioFilePath,
    commands,
  });

  return null;
}

export async function analyzePublicAudioUrl(
  fileUrl: string,
  requestMode: AnalyzerRequestMode = "staged",
) {
  const filePath = getPublicAudioFilePath(fileUrl);

  if (!filePath) {
    console.warn("Audio analysis could not resolve public URL", {
      fileUrl,
    });
    return null;
  }

  return analyzeAudioFile(filePath, requestMode);
}

export async function analyzeAndCacheRapBeat(
  client: AudioAnalysisClient,
  rapBeatId: string,
  options: {
    mode?: AnalyzerRequestMode;
  } = {},
) {
  const rapBeat = await client.rapBeat.findUnique({
    where: {
      id: rapBeatId,
    },
    select: {
      id: true,
      fileUrl: true,
      analyzedAt: true,
      detectedBpm: true,
      detectedKey: true,
      detectedMode: true,
      bpmConfidence: true,
      beatGridConfidence: true,
      keyConfidence: true,
      keyCertainty: true,
      tuningCents: true,
      referenceAHz: true,
      audioHash: true,
      analysisStatus: true,
      analysisSource: true,
      analysisVersion: true,
      manualBpm: true,
      manualKey: true,
      manualMode: true,
      bpmCandidatesJson: true,
      keyCandidatesJson: true,
    },
  });

  if (!rapBeat) {
    return null;
  }

  const audioFilePath = getPublicAudioFilePath(rapBeat.fileUrl);
  const currentAudioHash = audioFilePath ? getAudioHash(audioFilePath) : null;
  const hasAnalysisResult = rapBeat.detectedBpm !== null || Boolean(rapBeat.detectedKey);
  const hasCurrentAnalysis =
    rapBeat.analysisVersion === AUDIO_ANALYSIS_VERSION &&
    (!currentAudioHash || rapBeat.audioHash === currentAudioHash);
  const recentlyFailed =
    rapBeat.analyzedAt &&
    !hasAnalysisResult &&
    rapBeat.analysisStatus === "FAILED" &&
    Date.now() - rapBeat.analyzedAt.getTime() < FAILED_ANALYSIS_RETRY_MS;

  if (rapBeat.analysisStatus === "COMPLETE" && hasAnalysisResult && hasCurrentAnalysis) {
    return {
      bpm: rapBeat.detectedBpm,
      bpmConfidence: rapBeat.bpmConfidence ?? 0,
      beatGridConfidence: rapBeat.beatGridConfidence ?? 0,
      referenceAHz: rapBeat.referenceAHz,
      analysisVersion: rapBeat.analysisVersion ?? undefined,
      analysisStage: undefined,
      timings: undefined,
      key: rapBeat.detectedKey,
      mode: coerceMode(rapBeat.detectedMode),
      keyConfidence: rapBeat.keyConfidence ?? 0,
      keyCertainty: coerceKeyCertainty(rapBeat.keyCertainty),
      tuningCents: rapBeat.tuningCents,
      source: coerceSource(rapBeat.analysisSource),
      bpmCandidates: rapBeat.bpmCandidatesJson
        ? JSON.parse(rapBeat.bpmCandidatesJson)
        : undefined,
      keyCandidates: rapBeat.keyCandidatesJson
        ? JSON.parse(rapBeat.keyCandidatesJson)
        : undefined,
    } satisfies AudioAnalysisResult;
  }

  if (recentlyFailed) {
    console.info("Rap beat analysis retry skipped after recent failure", {
      rapBeatId: rapBeat.id,
      fileUrl: rapBeat.fileUrl,
    });
    return null;
  }

  console.info("Rap beat analysis queued", {
    rapBeatId: rapBeat.id,
    fileUrl: rapBeat.fileUrl,
  });

  const analysisStartedAt = Date.now();
  const result = await analyzePublicAudioUrl(rapBeat.fileUrl, options.mode ?? "staged");
  const analyzedAt = new Date();
  const analysisStatus = result && (result.bpm !== null || result.key) ? "COMPLETE" : "FAILED";

  if (analysisStatus === "FAILED" && hasAnalysisResult) {
    console.warn("Rap beat analysis failed; preserving previous analysis result", {
      rapBeatId: rapBeat.id,
      fileUrl: rapBeat.fileUrl,
      previousBpm: rapBeat.detectedBpm,
      previousKey: rapBeat.detectedKey,
    });

    return {
      bpm: rapBeat.detectedBpm,
      bpmConfidence: rapBeat.bpmConfidence ?? 0,
      beatGridConfidence: rapBeat.beatGridConfidence ?? 0,
      referenceAHz: rapBeat.referenceAHz,
      analysisVersion: rapBeat.analysisVersion ?? undefined,
      analysisStage: undefined,
      timings: undefined,
      key: rapBeat.detectedKey,
      mode: coerceMode(rapBeat.detectedMode),
      keyConfidence: rapBeat.keyConfidence ?? 0,
      keyCertainty: coerceKeyCertainty(rapBeat.keyCertainty),
      tuningCents: rapBeat.tuningCents,
      source: coerceSource(rapBeat.analysisSource),
      bpmCandidates: rapBeat.bpmCandidatesJson
        ? JSON.parse(rapBeat.bpmCandidatesJson)
        : undefined,
      keyCandidates: rapBeat.keyCandidatesJson
        ? JSON.parse(rapBeat.keyCandidatesJson)
        : undefined,
    } satisfies AudioAnalysisResult;
  }

  const prismaStartedAt = Date.now();
  await client.rapBeat.update({
    where: {
      id: rapBeat.id,
    },
    data: {
      detectedBpm: result?.bpm ?? null,
      bpmConfidence: result?.bpmConfidence ?? 0,
      beatGridConfidence: result?.beatGridConfidence ?? 0,
      detectedKey: result?.key ?? null,
      detectedMode: result?.mode ?? null,
      keyConfidence: result?.keyConfidence ?? 0,
      keyCertainty: result?.keyCertainty ?? "UNKNOWN",
      tuningCents: result?.tuningCents ?? null,
      referenceAHz: result?.referenceAHz ?? null,
      audioHash: currentAudioHash,
      analyzedAt,
      analysisStatus,
      analysisSource: result?.source ?? null,
      analysisVersion: result?.analysisVersion ?? AUDIO_ANALYSIS_VERSION,
      manualBpm: result?.source === "manual" ? result.bpm : null,
      manualKey: result?.source === "manual" ? result.key : null,
      manualMode: result?.source === "manual" ? result.mode : null,
      bpmCandidatesJson: result?.bpmCandidates
        ? JSON.stringify(result.bpmCandidates)
        : null,
      keyCandidatesJson: result?.keyCandidates
        ? JSON.stringify(result.keyCandidates)
        : null,
    },
  });
  const prismaUpdateMs = Date.now() - prismaStartedAt;
  const totalWrapperMs = Date.now() - analysisStartedAt;
  const resultWithTimings = result
    ? ({
        ...result,
        timings: {
          ...(result.timings ?? {}),
          prismaUpdateMs,
          totalWrapperMs,
        },
      } satisfies AudioAnalysisResult)
    : result;

  if (resultWithTimings) {
    console.info("Rap beat analysis saved", {
      rapBeatId: rapBeat.id,
      bpm: resultWithTimings.bpm,
      key: resultWithTimings.key,
      mode: resultWithTimings.mode,
      source: resultWithTimings.source,
      stage: resultWithTimings.analysisStage,
      timings: resultWithTimings.timings,
    });
  } else {
    console.warn("Rap beat analysis saved empty fallback", {
      rapBeatId: rapBeat.id,
      fileUrl: rapBeat.fileUrl,
    });
  }

  return resultWithTimings;
}

export async function analyzeAndCacheBattleSubmission(
  client: AudioAnalysisClient,
  submissionId: string,
) {
  const submission = await client.battleSubmission.findUnique({
    where: {
      id: submissionId,
    },
    select: {
      id: true,
      fileUrl: true,
      analyzedAt: true,
      detectedBpm: true,
      bpmConfidence: true,
      detectedKey: true,
      detectedMode: true,
      keyConfidence: true,
      tuningCents: true,
    },
  });

  if (!submission) {
    return null;
  }

  if (submission.analyzedAt) {
    return {
      bpm: submission.detectedBpm,
      bpmConfidence: submission.bpmConfidence ?? 0,
      key: submission.detectedKey,
      mode: coerceMode(submission.detectedMode),
      keyConfidence: submission.keyConfidence ?? 0,
      tuningCents: submission.tuningCents,
      source: "fallback",
    } satisfies AudioAnalysisResult;
  }

  const result = await analyzePublicAudioUrl(submission.fileUrl);

  await client.battleSubmission.update({
    where: {
      id: submission.id,
    },
    data: {
      detectedBpm: result?.bpm ?? null,
      bpmConfidence: result?.bpmConfidence ?? 0,
      detectedKey: result?.key ?? null,
      detectedMode: result?.mode ?? null,
      keyConfidence: result?.keyConfidence ?? 0,
      tuningCents: result?.tuningCents ?? null,
      analyzedAt: new Date(),
    },
  });

  return result;
}

export { normalizeTempoCandidates };
