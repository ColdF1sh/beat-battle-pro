# API Access Control Notes

Task 10.3 audit scope:

- Public routes: registration, NextAuth login, leaderboard, public profile pages.
- Authenticated routes: matchmaking search/status/cancel.
- Participant-only routes: battle room data, battle submissions, ranked voting.

Manual regression checks to keep covered:

- Unauthenticated matchmaking requests return `401`.
- Queue operations always filter by the current authenticated `userId`.
- Non-participants cannot view a battle room or submit/vote in that battle.
- Submission updates use the current user's own `BattleParticipant` row.
- Voting validates battle participation, same-battle participant IDs, no self-votes, one vote per battle, and submitted audio only.
- Leaderboard and public profile responses/pages do not expose email, password hashes, tokens, or private auth data.

TODO: add route-level tests for `requireCurrentUser`, `assertCanSubmitToBattle`, and `assertCanVoteInBattle` once the project has an API test harness.
