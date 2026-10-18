# Install or update native LaTeX Codex

Use this workflow for requests such as “更新 latex-codex” or “update LaTeX Codex”. The request authorizes installing the native plugin and correcting its marketplace source. Keep the selector `latex-codex@latex-codex-shared`; do not build or install DeepSeek.

## Resolve the source before installing

- Use the available Codex CLI; on Windows prefer `CODEX_CLI_PATH` when `codex` is not in PATH. Read `plugin marketplace list --json` to find the registered source. Do not assume the current directory or the installed cache is the source.
- For an unspecified update, obtain current `main` from `https://github.com/Fr0zenWatter/codex-latex-editor`. Honor an explicitly requested tag or local development source instead. Record the resolved commit and plugin manifest version. A displayed `0.3.5` alone cannot identify the code: older fixes reused this version.
- Refresh a clean checkout of the requested upstream/ref, or obtain a fresh copy. Preserve dirty worktrees and never install unpublished local changes for a generic GitHub update. If Git transport fails, the public GitHub API can resolve the ref and download its commit-pinned ZIP; validate the extracted native manifest and marketplace before use. Keep the verified source in a persistent directory. If upstream cannot be resolved, report the failure instead of calling an old copy current.

## Register the verified source and install

Run from the verified repository root. Inspect each command's exit status; a failed registration must not fall through to installation from the old source.

```text
codex plugin marketplace add .
codex plugin add latex-codex@latex-codex-shared --json
```

When `latex-codex-shared` is already registered to a different source, save that source's registration details first, then replace only this marketplace registration:

```text
codex plugin marketplace remove latex-codex-shared
codex plugin marketplace add .
codex plugin add latex-codex@latex-codex-shared --json
```

Removing a marketplace registration does not mean deleting its source directory. Preserve the old source and all other marketplaces. If registering the new source fails, restore the previous registration and report the failed update. Do not continue with the plugin install or edit the installed cache directly.

## Verify the actual installation

1. Re-read the marketplace list and confirm its resolved root is the intended source; account for Windows path spelling such as the `\\?\` prefix.
2. Read `installedPath` from the successful `plugin add --json` result. Compare SHA-256 hashes of every distributed native plugin file against the verified source, using paths relative to `plugins/latex-codex/`. Exclude generated `.git`, `__pycache__`, `.pyc` and `node_modules` content. Include the manifest, skill and references, Python modules and vendor assets. Matching version numbers or a successful install message do not replace this check.
3. Report success only when the source and installed files match. Report the version, source commit (or an explicitly requested unpublished development source) and actual installed path. A mismatch is an incomplete update; report it without claiming success.

Existing editor services keep their already loaded Python code. Preserve unsaved drafts and pending annotations; do not kill unrelated Python processes. If opening a document after this update, start a fresh host-side service outside the agent sandbox from the verified installed path rather than reusing a pre-update service. Load the updated skill in a new conversation; restart the desktop app if it still exposes the old plugin instructions. Do not overwrite drafts to force a restart.
