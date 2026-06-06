export type E2ETestUser = {
  email: string;
  username: string;
  password: string;
};

export const E2E_EMAIL_DOMAIN = "e2e.beat-battle.local";
export const E2E_USERNAME_PREFIX = "e2e_p_";

export function createTestRunId() {
  return `${Date.now().toString(36).slice(-5)}${Math.random()
    .toString(36)
    .slice(2, 5)}`;
}

export function createTestUser(runId: string, index: number): E2ETestUser {
  const username = `${E2E_USERNAME_PREFIX}${runId}_${index}`;

  return {
    username,
    email: `${username}@${E2E_EMAIL_DOMAIN}`,
    password: "password123",
  };
}

export function createTestUsers(runId: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    createTestUser(runId, index + 1),
  );
}
