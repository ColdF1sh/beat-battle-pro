import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function resolveBeatPath(input: string) {
  if (path.isAbsolute(input) && existsSync(input)) {
    return input;
  }

  const directPath = path.join(process.cwd(), input);

  if (existsSync(directPath)) {
    return directPath;
  }

  const beatRoot = path.join(
    process.cwd(),
    "public",
    "demo-audio",
    "Global Library",
    "Beat",
  );

  const normalizedInput = input.toLowerCase();
  const match = readdirSync(beatRoot).find(
    (fileName) => fileName.toLowerCase() === normalizedInput,
  );

  if (match) {
    return path.join(beatRoot, match);
  }

  const partialMatches = readdirSync(beatRoot).filter((fileName) =>
    fileName.toLowerCase().includes(normalizedInput),
  );

  if (partialMatches.length === 1) {
    return path.join(beatRoot, partialMatches[0]);
  }

  if (partialMatches.length > 1) {
    throw new Error(
      `Multiple beats match "${input}": ${partialMatches.slice(0, 12).join(", ")}`,
    );
  }

  return null;
}

function getDockerBeatPath(beatPath: string) {
  const demoAudioRoot = path.join(process.cwd(), "public", "demo-audio");
  const relativePath = path.relative(demoAudioRoot, beatPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return `/app/public/demo-audio/${relativePath.split(path.sep).join("/")}`;
}

async function runDockerDebug(beatPath: string) {
  const dockerBeatPath = getDockerBeatPath(beatPath);

  if (!dockerBeatPath || process.env.DISABLE_DOCKER_AUDIO_ANALYZER === "true") {
    return null;
  }

  try {
    const response = await fetch(
      `${process.env.ANALYZER_SERVICE_URL ?? "http://127.0.0.1:8765"}/analyze`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filePath: dockerBeatPath,
          debug: true,
        }),
        signal: AbortSignal.timeout(180_000),
      },
    );
    const text = await response.text();

    if (response.ok) {
      return {
        stdout: text,
        stderr: "",
      };
    }
  } catch {
    // Fall back to one-shot Docker below.
  }

  const demoAudioRoot = path.join(process.cwd(), "public", "demo-audio");
  const { stdout, stderr } = await execFileAsync(
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
      dockerBeatPath,
      "--debug",
    ],
    {
      timeout: 120_000,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  return { stdout, stderr };
}

function printAnalyzerOutput(stdout: string, stderr: string) {
  if (stderr.trim()) {
    console.warn(stderr.trim());
  }

  const jsonLine = stdout
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith("{"));

  if (!jsonLine) {
    console.log(stdout);
    return;
  }

  const result = JSON.parse(jsonLine) as Record<string, unknown>;
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const beatArg = process.argv[2];

  if (!beatArg) {
    console.error("Usage: pnpm beats:debug Beat59.mp3");
    process.exitCode = 1;
    return;
  }

  let beatPath: string | null = null;

  try {
    beatPath = resolveBeatPath(beatArg);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  if (!beatPath) {
    console.error(`Could not find beat: ${beatArg}`);
    process.exitCode = 1;
    return;
  }

  const scriptPath = path.join(process.cwd(), "scripts", "analyze-audio-key-bpm.py");
  try {
    const dockerResult = await runDockerDebug(beatPath);

    if (dockerResult) {
      printAnalyzerOutput(dockerResult.stdout, dockerResult.stderr);
      return;
    }
  } catch {
    console.warn("Docker analyzer unavailable for debug, using local Python fallback.");
  }

  const commands = [process.env.PYTHON, "python", "py"].filter(Boolean) as string[];
  let lastError: unknown = null;

  for (const command of commands) {
    try {
      const { stdout, stderr } = await execFileAsync(
        command,
        [scriptPath, beatPath, "--debug"],
        {
          timeout: 120_000,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      printAnalyzerOutput(stdout, stderr);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  console.error("Beat debug analysis failed.", lastError);
  process.exitCode = 1;
}

main();
