# Trellis

A desktop companion for Claude Code that keeps you understanding, and owning, what changed and why while AI writes the code.

*Keep the intent of your project understood while you work with AI agents.* [한국어 README](README.md)

You keep talking to Claude Code in a terminal exactly as before. Next to it, Trellis shows the intent of the current task, a per-turn timeline, changes grouped by area, decision records and structural health. The name comes from the frame a plant climbs: give the project a structure, and the people and the code grow along it.

## Why

When you hand work to an AI, the output arrives fast but understanding doesn't. "How did we fix that?" turns into "Claude said so", reasons get buried in chat history, and structure erodes one plausible change at a time.

Reading every diff line by line doesn't last either. Trellis splits the work: tests, automated checks and AI verify that the code is correct, while the human decides and owns *what* gets built and *why* — the intent and the decisions. Human time should scale with the number of decisions, not the size of the diff.

The reasoning behind this is in [docs/BACKGROUND.md](docs/BACKGROUND.md) (Korean).

## What works today (M1–M4)

- **Projects**: add folders and switch between them like Obsidian vaults. Terminal sessions keep running when you switch.
- **Built-in terminal**: pick a permission mode when you launch Claude, continue the last conversation or start a new one. Open several Claude and shell tabs per project.
- **Composer and images**: an input box under the Claude tab for IME input (Korean, Japanese, …). Pasted clipboard images are attached to Claude as `[Image #N]`; dropped files insert their path.
- **Task intent**: write what you want, what must not happen and where you expect changes. After the turn, Trellis compares the prediction with what actually changed and flags unexpected changes. "Must not" items can become invariants in the behavior spec.
- **Timeline**: one card per prompt, from tool use to the end of the turn, with a marker while Claude waits for approval. Files changed in a turn come from git snapshots at the start and end of the turn, so edits made through Bash are included.
- **Changes**: files changed since this session started (or since the last commit), grouped by area with line counts. Opens files in your editor.
- **Decisions**: after each turn, Trellis asks Claude once more to find choices that are hard to reverse or shape future work (dependencies, data formats, auth, structure). Cards show the consequence first; you write the reason yourself (the AI's guess is collapsed reference only). Recorded decisions become numbered files in `docs/decisions/`. Changes to risk areas (auth, payments, migrations, …) always raise a card.
- **Behavior**: the same analysis finds user-visible behavior changes. After you edit the sentence, it goes into per-area specs (`docs/specs/`, EARS statements with fixed ids like `B-001`). Tests that mention an id are counted as linked.
- **Health**: structure rules (long files, crowded folders, duplicate code, import cycles, path boundaries), what got worse since last week, paths that docs mention but that don't exist, and the biggest files and folders. Freeze today's violations as a baseline to see only new ones. Starter templates create the rules file and instruction, decision and spec docs.
- **End-of-turn check (optional)**: when Claude finishes, Trellis checks the new rule violations from that turn and runs your check command (e.g. `npm test`). If something fails, the turn is sent back to Claude with the reason (once per turn).
- **Editor**: on first open, choose from editors found on this machine (VS Code, Cursor, Zed, Sublime, JetBrains IDEs, …), the default app, or Finder/Explorer.
- **Settings**: Korean/English, dark/light theme, claude path and extra arguments, default permission mode, analysis model, editor, GPU terminal rendering, per-project decision/spec folders, record language, analysis on/off, risk areas, end-of-turn check and command.

Trellis is not an IDE. It doesn't show file contents or diffs; it opens them in your editor.

## How it works

- **Events**: Trellis launches `claude` with `--settings` that add HTTP hooks. Hooks post to a token-protected Trellis server on `127.0.0.1`; Claude never waits on Trellis if it doesn't answer. The target repository's `.claude` settings are untouched and its own hooks keep running.
- **Changes** are computed from git, not hooks: snapshots are written through a temporary index, so the working tree, index and branches are never touched.
- **Analysis**: when a turn ends, Trellis runs `claude -p` once with no tools and with the user's hooks and MCP servers disabled (`--restricted --strict-mcp-config`), in a temp folder, and gets decision and behavior candidates as JSON.
- **Rules** are read from `.trellis/rules.json` and `.trellis/baseline.json` in the target repository's git tree. A turn is judged by the rules as they were when the turn started, so an agent can't loosen the rules to pass.
- The terminal screen is never parsed. Everything tied to Claude Code's interface (hook fields, CLI flags) lives in `src/main/features/agents/claude-code/`.

## Data and privacy

- Settings, the project list and the event log (including prompts and commands) stay in the app data folder and are never sent anywhere: `~/Library/Application Support/Trellis` on macOS, `%APPDATA%\Trellis` on Windows.
- Trellis does not edit files in your repository. Snapshots may leave unreferenced objects in `.git/objects`, which `git gc` cleans up.
- It only writes what you approve with a button: decision records, behavior specs, `.trellis/` rules and baseline, and starter templates. It never overwrites existing files.
- With analysis on, each turn sends part of that turn's diff (up to about 40k characters), the request and the intent to Anthropic once more through your logged-in Claude Code — the same path your Claude session already uses. You can turn it off per project.

## Status and known limits

Version 0.2.0. M1 (self-hosting) and M2–M4 (decision detection, structure rules with end-of-turn checks, behavior specs and prediction comparison) are implemented and being tested on real projects.

- Builds are not code-signed yet, so macOS and Windows show a security warning on first launch.
- The Windows installer is built in CI but hasn't been tested on a real Windows PC yet.
- Claude Code is the only supported agent (tested with 2.1.29x).
- `claude` started by hand in a shell tab has no event bridge and won't appear in the timeline. Use a Claude tab.
- If several Claude tabs edit the same folder at once, per-turn changes can mix.
- macOS builds are Apple Silicon (arm64) only.
- Analysis adds one Claude call per turn with changes (about 8 seconds with sonnet, counted against your subscription). It can miss decisions or flag things that aren't.
- Rule analysis runs in the main process: about 0.7 s per refresh at ~7,000 files. Larger repositories aren't optimized yet.
- Import extraction is regex-based, so dynamic imports or unusual aliases can be missed (missed imports are left out of rule checks; they don't create false positives).

## Install

Download the installer from [Releases](../../releases) once a version is tagged, or from the artifacts of a GitHub Actions run.

- macOS: `Trellis-<version>-mac-arm64.dmg`. Unsigned for now: right-click the app in Finder → Open the first time.
- Windows: `Trellis-Setup-<version>-win-x64.exe`. If SmartScreen appears, choose "More info → Run anyway".

Requirements: [Claude Code](https://code.claude.com/docs), logged in, and git. No API key needed.

## Development

Node 24 and npm 11 (same as CI).

```bash
npm install            # dependencies, node-pty permissions, native modules
npm run dev            # dev build with live reload (separate data folder: Trellis-dev)
npm run install:local  # replace /Applications/Trellis.app with the current code (macOS)
npm run check          # types, lint, format, i18n, structure rules, unit tests (required before commits)
npm run e2e            # build, then an end-to-end smoke test with a fake claude
npm run dist:mac       # macOS installer (build the Windows one on Windows with dist:win)
```

Code structure and working rules are in [AGENTS.md](AGENTS.md), shared by people and agents (Claude Code, Codex, …); `CLAUDE.md` is a symlink to it. Docs, ADRs, worklogs and commit messages are written in Korean; code and comments are in English.

## Docs (Korean)

- [docs/PLAN.md](docs/PLAN.md): the working plan — scope, milestones, checklists
- [docs/BACKGROUND.md](docs/BACKGROUND.md): why it looks like this
- [docs/decisions/](docs/decisions/): decision records (ADRs)
- [docs/worklog/](docs/worklog/): per-session worklogs
- [docs/experiment-log.md](docs/experiment-log.md): experiments that check whether it helps

## License

[MIT](LICENSE)
