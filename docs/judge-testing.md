# Run Story Keeper locally as a judge

This walkthrough uses fictional data, deterministic mock extraction, real MCP calls, and a real
SQLite database. No AWS credentials or paid services are needed. Use typed answers in the browser.

**Live Bedrock AI and Alexa/Alexa+ voice integration are not verified by this walkthrough.** Local
MCP compatibility targets `2025-11-25` over Streamable HTTP; that is not proof of an Alexa voice
session or Amazon certification. Mock output demonstrates the review and approval workflow, not
live AI extraction quality.

## 1. Requirements and installation

Run commands from the repository root. Commands below use **PowerShell**.

- **Node.js 24 LTS**, version `>=24 <25`, as required by the root `package.json`.
- **pnpm 12.10.1**, pinned by `packageManager`. Although `engines.pnpm` allows `>=10`, use the pinned
  version for this walkthrough.
- **Corepack** available on `PATH`, to invoke that pinned pnpm version. A global pnpm installation
  or `corepack enable` is unnecessary when using `corepack pnpm`.
- A desktop browser and free local ports **4300, 4273, 4274, 4275, 4276**.

```powershell
node --version
corepack --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
```

Expect Node `v24.x` and pnpm `12.10.1`. Install Node 24 and Corepack first if those commands are
unavailable. Installation may download dependencies; the running mock demo does not need AWS.

## 2. Create a disposable fictional database

In **terminal 1**, create a new temporary directory and explicitly select it. Keep this terminal
open for the backend. Do not point the mock launcher at an existing database.

```powershell
$judgeDemoDir = Join-Path ([System.IO.Path]::GetTempPath()) ('storykeeper-judge-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $judgeDemoDir | Out-Null
$env:DATABASE_PATH = Join-Path $judgeDemoDir 'judge.sqlite'
$env:STORY_EXTRACTION_PROVIDER = 'disabled'
$env:CHAPTER_GENERATION_PROVIDER = 'disabled'
$env:HTTP_HOST = '127.0.0.1'
$env:PORT = '4300'
$env:HTTP_ALLOWED_HOSTS = '127.0.0.1,localhost'
$env:HTTP_ALLOWED_ORIGINS = 'http://localhost:4273,http://localhost:4274,http://localhost:4275,http://localhost:4276'
Write-Output $env:DATABASE_PATH
corepack pnpm db:migrate
corepack pnpm db:seed
```

Migration should exit successfully. Seed should print `status: "seeded"` and deterministic IDs for
the fictional Story Keeper Demo Family, Rosa (narrator), Maya (relative), and Arun (child). The
ordinary seed creates actors only, not approved stories. Repeating it does not reset interview data.

No `.env` file needs to be created or overwritten. The migration/seed scripts load an existing
`.env` if present, but these explicit environment variables take precedence and disable both paid
providers. Do not print or share an existing `.env` or AWS configuration.

## 3. Start the offline mock backend and its workers

The normal `dev` / `dev:backend` startup accepts extraction providers `disabled` and `bedrock` only.
**There is no `STORY_EXTRACTION_PROVIDER=mock` setting and no separate worker CLI.** With providers
disabled, normal startup saves answers but does not run extraction.

For an interactive offline demo, use the repository's existing browser-test launcher. In the same
**terminal 1**, after the environment setup above:

**Reset warning — read before running:** this test launcher deletes the selected `DATABASE_PATH`
and its `-wal` / `-shm` sidecars on **every launch**. It recreates the fictional actors and additional
fixtures, replacing the actor-only database from step 2. Use only the fresh temporary path created
there, never an existing database. A browser reload preserves the running database; restarting
this launcher resets the story.

```powershell
node --conditions=development --import tsx apps/simulator/e2e/start-backend.ts
```

Expect a `server.start` log with host `127.0.0.1` and port `4300`. Leave this process running.
The launcher starts the real MCP backend plus mock extraction and chapter worker loops, polling
every 500 ms. Both provider environment variables must stay `disabled`; the launcher supplies
mock provider objects itself, without Bedrock calls.

The initial fixtures include:

- Pending, conflicting Favorite place facts: “The private garden” and “The old market square.”
- An already approved timeline event, “Moved near the old market,” dated **1962–1964**.
- A known Raj identity used to demonstrate ambiguous extracted names.

These are preloaded test fixtures, not discoveries from the answer you are about to type. Every
subsequent answer receives the same fixed mock extraction, regardless of its wording. The new
answer still goes through persisted `save_answer`, a queued job, validation, pending memory, and
explicit MCP approval. Do not use this mock to evaluate arbitrary stories or factual accuracy.

## 4. Start and open the frontend

Open **terminal 2** in the repository root. This block uses the installed Vite API to load each
app's existing configuration, overriding only its port and MCP proxy for this run. It writes no
project files and keeps the backend on the verified alternate port:

```powershell
$env:VITE_MCP_URL = '/mcp'
@'
import { resolve } from 'node:path';
import { createServer } from 'vite';

const servers = [];
for (const [app, port] of [
  ['simulator', 4273],
  ['timeline', 4274],
  ['family-tree', 4275],
  ['chapter-review', 4276],
]) {
  const root = resolve('apps', app);
  const server = await createServer({
    root,
    configFile: resolve(root, 'vite.config.ts'),
    server: {
      port,
      strictPort: true,
      proxy: { '/mcp': { target: 'http://127.0.0.1:4300' } },
    },
  });
  await server.listen();
  servers.push(server);
  server.printUrls();
}
const stop = async () => { await Promise.all(servers.map(server => server.close())); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
'@ | node --input-type=module
```

This starts only the four frontend apps. Keep it running alongside terminal 1. Do not also start
the ordinary development servers; this walkthrough uses the alternate ports throughout.

| Surface | Open in the browser |
| --- | --- |
| Interview, review, and search | <http://localhost:4273/> |
| Approved timeline | <http://localhost:4274/> |
| Approved family tree | <http://localhost:4275/> |
| Approved chapters | <http://localhost:4276/> |

Use these direct URLs to move between apps: the shared header's surface links still point to the
project's default ports. The simulator's **Open interview** and **Open search** buttons stay within
the alternate-port app and work normally. Use `localhost` for browser URLs to match the explicit
origin allowlist. In another terminal, you can check backend liveness:

```powershell
Invoke-RestMethod http://127.0.0.1:4300/health
```

Expect `status` equal to `ok`. Health alone does not verify MCP; the simulator connection below does.

## 5. Rosa's answer, review, and separate approvals

Follow this sequence once on a freshly launched fixture database. Additional answers or approvals
can change the result counts.

1. Open <http://localhost:4273/>, click **Connect**, and wait for **15 tools verified**.
2. Click **Start / Resume interview**. In **Rosa’s answer**, type:

   > The garden gate squeaked whenever the evening breeze came through.

3. Click **Submit answer** once. Expect **Your answer was saved.**, then **New structured memory
   is ready.** The text box clears. Saving does not approve any derived memory.
4. Under **Review story memories**, inspect **Garden sound**, with value “The garden gate in the
   evening breeze,” and **Evenings by the garden gate**, dated **Around 1974**. They are pending.
   Expand **Source details** on Garden sound; expect **Supported by 1 interview source.**
5. The mock also produces a pending child relationship to Maya and an unresolved sibling candidate
   involving Raj, plus Devika's unresolved identity. Leave these alone. Ambiguous identities must
   not become confirmed family-tree links automatically.
6. Click **Open search**, set **Search as** to **Maya**, enter `garden`, and click **Search**.
   Expect **No matching family stories found.** The initial private garden fact and new extracted
   memory are still pending.
7. Click **Open interview**, then set **Inspect memory as** in the Developer Memory Inspector to
   **Rosa · narrator**. This is the role control for this flow; the header selectors are not a
   substitute for it.
8. Under **Memories that need review**, click **Keep the first memory**, read the confirmation,
   then click **Confirm: Keep the first memory**. Expect the conflict to disappear, “The old market
   square” to leave active review, and the surviving Favorite place fact to remain **Pending
   memory**. Conflict resolution is not approval. Leave Favorite place pending.
9. On the **Garden sound** card only, click **Approve** (accessible name **Approve Garden sound**).
   Expect **Approved memory**. The garden timeline event must remain pending.
10. Open search again, select Maya if necessary, and submit `garden` again. Expect **one** result
    labeled **Memory**, titled **garden sound**, with the garden-gate value. Search titles can use
    different capitalization from review cards.
11. Open <http://localhost:4274/> in another tab and click **Connect and load timeline**. Expect
    only the preapproved **Moved near the old market**, dated **1962–1964**. The new garden event
    must still be absent: approving a fact does not approve its related event.
12. Return to the simulator, click **Open interview**, and select **Rosa · narrator** under
    **Inspect memory as**. On **Evenings by the garden gate**, click its own **Approve** button.
    Expect **Approved timeline memory**. This is the second, separate approval.
13. Open search, select Maya, and submit `garden` again. Expect **two** results: the **Memory**
    result and a **Timeline** result for **Evenings by the garden gate**. The unapproved Favorite
    place fact must remain absent.
14. In the timeline tab, click **Refresh timeline**. Expect the garden event to appear after the
    1962–1964 move, still dated **Around 1974**. No exact day or month should be invented.
15. Reload the simulator, reconnect, open search, select Maya, and submit `garden` again. The two
    approved results should remain: the database, not browser state, owns the story.

Family tree and approved chapters may remain empty for this sequence: neither relationship nor
chapter approval is part of the garden walkthrough. The chapter page is an approved-family read
surface; private chapter review is in the simulator.

## 6. Automated offline backend check

From the repository root:

```powershell
corepack pnpm demo:smoke
```

Expect **1 test file / 2 tests passed**. This existing check uses mock providers and isolated
in-memory/temporary databases for the backend journey and restart recovery. It does not call AWS
or use the selected demo database. It complements the browser walkthrough; it does not verify
Alexa voice or live model output.

## Troubleshooting and stopping

| Symptom | What to check |
| --- | --- |
| `corepack` or Node missing / wrong version | Install the prerequisites; verify Node 24 and pinned pnpm before installation. |
| Frozen-lockfile install fails | Keep the lockfile intact. Check network access and package-manager version; preserve the error for diagnosis. |
| SQLite native-binding error | Confirm installation and execution both use Node 24, then rerun the frozen-lockfile install. A source build may require platform build tools if a prebuilt binary is unavailable. |
| `EADDRINUSE` or Vite reports port in use | Stop only a previous demo you own, or use a machine with ports 4300 and 4273–4276 free. Keep the backend `PORT`, temporary Vite proxy, frontend ports, and origin allowlist consistent. Do not kill unknown processes. |
| A header link opens the wrong app or port | Use the direct alternate-port URLs above; the shared header's surface links retain the project's default ports. |
| Health works but Connect fails | Confirm all apps use `/mcp`, the backend is running, and the browser uses the listed `localhost` URLs. Check terminal errors for Host/Origin rejection. |
| Answer saved but no new memory | Ensure terminal 1 runs `apps/simulator/e2e/start-backend.ts`, not ordinary `dev:backend`. Wait for the worker, then use **Check again** if offered. Do not set the provider to `mock` or `bedrock`. |
| Missing family / wrong fixtures | Confirm `DATABASE_PATH` was set in terminal 1 before launching. Start a new disposable run using steps 2–3; never reset an existing personal database. |
| Search is empty after approval | Check **Approved memory** / **Approved timeline memory** on the intended card, select Maya, and submit `garden` again. Search is submitted explicitly; pending facts, events, and drafts are excluded. |
| Timeline did not update | Click **Refresh timeline**. Confirm you approved the event separately from the fact. |
| Result counts differ | Use exactly one submitted answer and the listed approvals on a fresh fixture run. Do not approve Favorite place or generate/approve a chapter for this check. |
| Browser refresh clears text or selections | Unsent answers and searches are transient. Reconnect, reselect the role, and rerun the query; saved backend memory persists until the mock launcher is restarted. |

Stop both demo terminals with **Ctrl+C**. Close them to discard their environment overrides.
The disposable database is at the path printed in step 2; delete only that newly created temporary
directory manually after the processes have stopped if desired. No deletion of repository data or
existing databases is needed.

## Verification record and limits

Verified on Windows PowerShell with **Node v24.16.0**, **Corepack 0.35.0**, and **pnpm 12.10.1**:

- `corepack pnpm install --frozen-lockfile` succeeded using the existing dependency cache.
- Migration and fictional actor seed succeeded against a new temporary SQLite path.
- The documented mock launcher started; a real Chromium walkthrough verified answer save,
  asynchronous pending extraction, source disclosure, conflict resolution without approval,
  separate fact/event approvals, Maya's `garden` search (0 → 1 → 2 results), timeline filtering and
  approximate dates, and approved-search persistence across browser reload.
- All four frontend surfaces loaded. The exercised simulator flow had no browser console errors
  or page exceptions. Screenshots were captured during verification outside the repository.
- `corepack pnpm demo:smoke` passed both tests.
- `corepack pnpm typecheck`, the guide's Prettier check, and whitespace checks passed.
- During publication review, the setup, backend, and frontend command blocks above were executed
  as written on a fresh disposable database. Health and the full garden browser walkthrough
  passed on ports 4300 and 4273–4276.

The project's default ports were already occupied during the initial verification. Existing
processes were left untouched. This guide uses the verified alternate ports: mock backend **4300**
and temporary Vite server overrides on **4273–4276** proxying to it. No project configuration is
changed. Use the direct URLs above because shared header links retain the defaults.

A fresh-machine dependency download, other operating-system shells/browsers, live Bedrock calls,
AWS credentials/model access, deployed HTTPS, and Alexa/Alexa+ voice were **not verified**. No paid
services were called, existing user databases were not modified, and no credentials are supplied
or required by this guide.
