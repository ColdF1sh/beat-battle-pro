# MVP QA Report

Generated: 2026-05-14T18:04:08.335Z

## Summary

- PASS: 18
- WARN: 1
- FAIL: 0

## Tested Systems

- Environment and database
- Auth and protected routes
- Two 5-player matchmaking rooms
- Old room safety
- Battle room rendering
- Submission and waveform display
- Ranked voting and Elo processing
- Leaderboard and public profile
- Security checks

## Room Proof

- Room A ID: cmp5srin70005wsx803smqwud
- Room B ID: cmp5srpbd000gwsx8vbfy7e3n
- Room A !== Room B: true

## Key Results

- Old room safety: PASS - fresh battle cmp5srvpi000rwsx8v1hxk7ww
- Storage/upload: WARN - storage env exists, but upload did not complete locally.
- Waveform: PASS - waveform/audio player rendered from demo audio.
- Voting: PASS - battle finished with 5 Elo results.
- Elo duplicate prevention: PASS - duplicate finish did not create extra Elo rows.

## Checks

- **PASS** App reachable: http://localhost:3000 returned 200.
- **PASS** Database connection: Prisma can query PostgreSQL.
- **PASS** Prisma Client: Prisma Client loaded successfully.
- **PASS** Storage env: PASS - S3/MinIO env vars are configured.
- **PASS** Safe cleanup: Removed QA queues and 0 QA-created battles only.
- **PASS** QA users: Created or reused qa_producer_1 through qa_producer_10.
- **PASS** Room A matchmaking: Created cmp5srin70005wsx803smqwud with 5 participants.
- **PASS** Room B matchmaking: Created cmp5srpbd000gwsx8vbfy7e3n with 5 participants.
- **PASS** Simultaneous room isolation: Room A cmp5srin70005wsx803smqwud, Room B cmp5srpbd000gwsx8vbfy7e3n.
- **PASS** Old room safety: PASS - fresh battle cmp5srvpi000rwsx8v1hxk7ww
- **WARN** Real audio upload: WARN - storage env exists, but upload did not complete locally.
- **PASS** Waveform player: PASS - waveform/audio player rendered from demo audio.
- **PASS** Voting and Elo: PASS - battle finished with 5 Elo results.
- **PASS** Duplicate Elo prevention: PASS - duplicate finish did not create extra Elo rows.
- **PASS** Anonymous protected route: /battle redirects anonymous users to /login.
- **PASS** Protected API unauthenticated: GET /api/matchmaking/status returned 401.
- **PASS** Non-participant API access: Submit 403, vote 403.
- **PASS** Invalid vote validation: Invalid vote body returned 400.
- **PASS** Leaderboard safe data: Leaderboard does not expose email or passwordHash.

## Screenshots

- tests/screenshots/01-login-page.png
- tests/screenshots/02-battle-page.png
- tests/screenshots/03-matchmaking-room-a-search.png
- tests/screenshots/04-battle-room-a.png
- tests/screenshots/05-matchmaking-room-b-search.png
- tests/screenshots/06-battle-room-b.png
- tests/screenshots/07-old-room-safety.png
- tests/screenshots/08-upload-ui.png
- tests/screenshots/09-waveform-player.png
- tests/screenshots/10-voting-ui.png
- tests/screenshots/11-finished-results.png
- tests/screenshots/12-leaderboard.png
- tests/screenshots/13-profile.png

## Browser Console Errors

- anonymous: A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:

- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

%s%s https://react.dev/link/hydration-mismatch

  ...
    <RedirectBoundary>
      <RedirectErrorBoundary router={{...}}>
        <InnerLayoutRouter url="/login" tree={[...]} params={{}} cacheNode={{rsc:{...}, ...}} segmentPath={[...]} ...>
          <SegmentViewNode type="page" pagePath="(auth)/log...">
            <SegmentTrieNode>
            <ClientPageRoot Component={function LoginPage} serverProvidedParams={{...}}>
              <LoginPage params={Promise} searchParams={Promise}>
                <Card className="border-whi...">
                  <div data-slot="card" data-size="default" className={"group/ca..."}>
                    <CardHeader>
                    <CardContent>
                      <div data-slot="card-content" className="px-4 group...">
                        <form className="space-y-4" data-testid="login-form" onSubmit={function}>
                          <div className="space-y-2">
                            <Label>
                            <Input id="identifier" data-testid="login-iden..." autoComplete="username" ...>
                              <input
                                type={undefined}
                                data-slot="input"
                                className="h-8 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base transition-color..."
                                id="identifier"
                                data-testid="login-identifier"
                                autoComplete="username"
                                placeholder="test_user"
                                aria-invalid={false}
                                name="identifier"
                                onChange={function onChange}
                                onBlur={function onChange}
                                ref={function ref}
-                               style={{caret-color:"transparent"}}
                              >
                          <div className="space-y-2">
                            <Label>
                            <Input id="password" data-testid="login-pass..." type="password" autoComplete="current-pa..." ...>
                              <input
                                type="password"
                                data-slot="input"
                                className="h-8 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base transition-color..."
                                id="password"
                                data-testid="login-password"
                                autoComplete="current-password"
                                aria-invalid={false}
                                name="password"
                                onChange={function onChange}
                                onBlur={function onChange}
                                ref={function ref}
-                               style={{caret-color:"transparent"}}
                              >
                          ...
                        ...
          ...
        ...

- qa_producer_1: A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:

- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

%s%s https://react.dev/link/hydration-mismatch

  ...
    <RedirectErrorBoundary router={{...}}>
      <InnerLayoutRouter url="/battle/cm..." tree={[...]} params={{battleId:"..."}} cacheNode={{rsc:{...}, ...}} ...>
        <SegmentViewNode type="page" pagePath="(app)/batt...">
          <SegmentTrieNode>
          <BattleRoomPage>
            <section className="space-y-5" data-testid="battle-room">
              <header>
              <div className="grid gap-5...">
                <aside>
                <main className="min-w-0">
                  <div className="bb-panel m...">
                    <div>
                    <div className="p-5 sm:p-6">
                      <div className="space-y-5" data-testid="submission...">
                        <div>
                        <SubmissionUploadForm battleId="cmp5srvpi0..." currentSubmission={null} canSubmit={true}>
                          <form className="space-y-4" data-testid="submission..." onSubmit={function handleSubmit}>
                            <div className="space-y-2">
                              <Input type="file" data-testid="submission..." accept=".mp3,.wav,..." disabled={false} ...>
                                <input
                                  type="file"
                                  data-slot="input"
                                  className="w-full min-w-0 rounded-lg border px-2.5 py-1 text-base transition-colors ..."
                                  data-testid="submission-file-input"
                                  accept=".mp3,.wav,.flac"
                                  disabled={false}
                                  onChange={function handleFileChange}
-                                 style={{caret-color:"transparent"}}
                                >
                              ...
                            ...
                ...
        ...
      ...

- qa_producer_1: A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:

- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

%s%s https://react.dev/link/hydration-mismatch

  ...
    <RedirectErrorBoundary router={{...}}>
      <InnerLayoutRouter url="/battle/cm..." tree={[...]} params={{battleId:"..."}} cacheNode={{rsc:{...}, ...}} ...>
        <SegmentViewNode type="page" pagePath="(app)/batt...">
          <SegmentTrieNode>
          <BattleRoomPage>
            <section className="space-y-5" data-testid="battle-room">
              <header>
              <div className="grid gap-5...">
                <aside>
                <main className="min-w-0">
                  <div className="bb-panel m...">
                    <div>
                    <div className="p-5 sm:p-6">
                      <div className="space-y-5" data-testid="submission...">
                        <div>
                        <SubmissionUploadForm battleId="cmp5srvpi0..." currentSubmission={{id:"cmp5sr...", ...}} ...>
                          <form className="space-y-4" data-testid="submission..." onSubmit={function handleSubmit}>
                            <div>
                            <div className="space-y-2">
                              <Input type="file" data-testid="submission..." accept=".mp3,.wav,..." disabled={false} ...>
                                <input
                                  type="file"
                                  data-slot="input"
                                  className="w-full min-w-0 rounded-lg border px-2.5 py-1 text-base transition-colors ..."
                                  data-testid="submission-file-input"
                                  accept=".mp3,.wav,.flac"
                                  disabled={false}
                                  onChange={function handleFileChange}
-                                 style={{caret-color:"transparent"}}
                                >
                              ...
                            ...
                      ...
                ...
        ...
      ...


## API/Server Errors

- None captured

## Recommendations

- Review WARN items, especially storage availability, before production-like QA.
