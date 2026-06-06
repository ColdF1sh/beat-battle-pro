export type BattleModeCategory = "beatmaking" | "rap";

export type BattleModeStatus = "active" | "coming-soon";

export type BattleMode = {
  id:
    | "beatmaking_strict"
    | "beatmaking_free_flying"
    | "beatmaking_bullet"
    | "rap_free_flying";
  category: BattleModeCategory;
  name: string;
  description: string;
  rules: string[];
  players: string;
  minPlayers: number;
  maxPlayers: number;
  defaultDurationMinutes: number;
  allowedDurationMinutes: number[];
  requiresDrafting: boolean;
  status: BattleModeStatus;
  isEnabled: boolean;
};

export const battleModes = [
  {
    id: "beatmaking_strict",
    category: "beatmaking",
    name: "Strict Rules",
    description:
      "A structured beat battle where players can pick BPM, genre, and key.",
    rules: ["Draft BPM", "Draft genre", "Draft key", "Draft duration"],
    players: "5 players",
    minPlayers: 5,
    maxPlayers: 5,
    defaultDurationMinutes: 20,
    allowedDurationMinutes: [10, 15, 20, 30],
    requiresDrafting: true,
    status: "active",
    isEnabled: true,
  },
  {
    id: "beatmaking_free_flying",
    category: "beatmaking",
    name: "Free Flying",
    description: "A free-form beat battle with open creative rules.",
    rules: ["No BPM restrictions", "No genre restrictions", "No key restrictions"],
    players: "5 players",
    minPlayers: 5,
    maxPlayers: 5,
    defaultDurationMinutes: 15,
    allowedDurationMinutes: [15],
    requiresDrafting: false,
    status: "active",
    isEnabled: true,
  },
  {
    id: "beatmaking_bullet",
    category: "beatmaking",
    name: "Bullet",
    description: "A frantic 5-minute beatmaking battle.",
    rules: ["5 minute time limit", "Instant start", "No drafting"],
    players: "5 players",
    minPlayers: 5,
    maxPlayers: 5,
    defaultDurationMinutes: 5,
    allowedDurationMinutes: [5],
    requiresDrafting: false,
    status: "active",
    isEnabled: true,
  },
  {
    id: "rap_free_flying",
    category: "rap",
    name: "Free Flying",
    description: "A standard rap battle over one shared beat.",
    rules: ["One shared beat", "Vocal submission", "Anonymous rating"],
    players: "5 players",
    minPlayers: 5,
    maxPlayers: 5,
    defaultDurationMinutes: 15,
    allowedDurationMinutes: [15],
    requiresDrafting: false,
    status: "active",
    isEnabled: true,
  },
] satisfies BattleMode[];

export const activeBattleModes = battleModes.filter((mode) => mode.isEnabled);

export const beatmakingModes = battleModes.filter(
  (mode) => mode.category === "beatmaking",
);

export const rapModes = battleModes.filter((mode) => mode.category === "rap");
