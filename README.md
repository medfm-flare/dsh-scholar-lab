# dsh-scholar-lab

**Google Scholar search agent for DeepSeek Harness (DSH)** — publishable as an npm
**profile bundle** (one-command install into any DSH profile) or usable as a
**dynamic Cordis plugin** (no install, per-session).

Search Google Scholar for academic papers and get structured metadata — title,
**full journal name** (when resolvable), **JCR impact factor + quartile**, authors,
year, cited-by count, abstract-excerpt snippet, PDF link, versions — plus full
abstracts from publisher pages and **CSV export** of any result set.

## Install (profile bundle — the community path)

```sh
dsh plugin --profile web add @yourscope/dsh-scholar-lab
dsh web
```

The `dsh plugin` command forwards to pnpm inside the profile; any installed
package declaring `dsh.bundle` automatically joins the profile's bundle layer
stack (`dsh.profile.bundles`) and its `cordis.patch.yml` composes into the app
config. Remove with:

```sh
dsh plugin --profile web remove @yourscope/dsh-scholar-lab
```

> Requires `@deepseek-ai/dsh` ≥ 0.1.0 and the base profile's `shell` service
> (default web profile; fetches go through `curl`).

## What you get

| Surface | Description |
| --- | --- |
| `scholar_search` tool | Chat-side search: `query`, `max_results` (1–20), `start`, `year` (`"2020"` or `"2018-2023"`), `lang`, `export_csv` (writes `scholar-lab/scholar-export-*.csv` into the workspace via the `fs` service) |
| `scholar_abstract` tool | Full abstract + HighWire `citation_*` metadata from a result/publisher URL |
| Search panel (UI) | Run-card panel with search box, pagination ("Load more papers", deduped, ≤100), and **Download CSV** (browser-side, nothing written to the host) |
| Result cards | `scholar_search` / `scholar_abstract` result views with JCR IF badges |

Per-paper fields: `title, authors[], authors_raw, venue, journal_full,
impact_factor, jif_quartile, publisher, year, cited_by, snippet, link, pdf,
versions, cluster_id, cites_id, result_id`.

## Package layout

| File | Contents |
| --- | --- |
| `lib/host.js` | Host half: `scholar_search` / `scholar_abstract` tools (`ctx.tools.register` + `defineTool` from `@deepseek-ai/dsh-tools`), the `scholarLab` service (`ctx.provide`) for the panel, CSV writer |
| `lib/client.js` | Client half: browser bundle in the web-shell module-table format (`window.__ModuleLoader__.load`), search panel + tool result cards |
| `data/journal-impact-factors.json` | JCR 2025 database (full names, IFs, quartiles) — 22,643 journals, 1.5 MB, read from the package via `import.meta.url` |
| `cordis.patch.yml` | Bundle patch layer: inserts the `scholar-lab` (host) and `scholar-lab-client` (browser roster) rows |
| `scholar-lab/` (source) | The original dynamic Cordis plugin files this package was generated from |

## Develop & verify locally (before publishing)

```sh
# 1. Syntax / structure checks
node --check lib/host.js
node --check lib/client.js

# 2. Pack and install into a throwaway profile (or your web profile)
pnpm pack
dsh plugin --profile web add ./dsh-scholar-lab-0.1.0.tgz

# 3. Confirm the layers compose without booting
dsh --profile web --dump-config | grep -A3 scholar-lab

# 4. Boot and test
dsh web
```

## Publish to npm

```sh
# fill in package.json: name (real scope), repository, homepage, license holder
npm login
npm publish        # scoped packages publish private by default — `publishConfig.access: "public"` is already set
```

Version semver; tag releases; attach the packed tarball to GitHub releases for
air-gapped installs (`dsh plugin --profile web add <tarball-url>`).

## Notes

The packaged API was mapped from the in-box bundles (`@deepseek-ai/dsh-base`,
`@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-tool-web`,
`@deepseek-ai/dsh-client-ui-cordis`). Two points should be confirmed against the
running app before publishing a public release:

1. **Client → host RPC service name.** The client calls
   `ctx.remote.scholarLab.search(...)` / `.exportCsv(...)`; the host provides the
   `scholarLab` service. If the gateway expects a different host-side service id
   (e.g. `remote.scholarLab`), change `ctx.provide('scholarLab', ...)` in
   `lib/host.js` and the `remote.scholarLab` entry in the client `inject` list
   together.
2. **Slot keys.** The client injects into `tool.view.cordis` (panel) and
   `tool.call.toolview` (result cards, keyed by tool name). If the packaged slot
   names differ from the dynamic runner's, adjust the `slots.inject(...)` calls
   in `lib/client.js`.

If a seam turns out different, fix the one file and bump a patch version —
nothing else in the package changes.

## Data & legal notes

- The journal database is from [hitfyd/ShowJCR v2026-1.2](https://github.com/hitfyd/ShowJCR/releases).
- Scholar's ToS / rate limits: results and abstracts are cached in memory
  (search 10 min, abstract 30 min); a CAPTCHA/"unusual traffic" response is
  returned as a clear error. Document this behavior for your users.

## License

MIT — covers your code in `lib/` and this repo's files. The bundled JCR data is
third-party (see above).

## Zero-install alternative: dynamic Cordis plugin

No npm needed — recreate the plugin in any session by copying the `scholar-lab/`
folder from the source repo next to the working directory and pasting into chat:

> Create a Cordis plugin with `kind: "new"`, `idPrefix: "schlr"`, name "Google
> Scholar Lab", purpose "Search Google Scholar for papers with full journal
> names, JCR impact factors, and CSV export of paper metadata". Use `code.host`
> from the file `scholar-lab/plugin.host.js` and `code.client` from
> `scholar-lab/plugin.client.js`.

Dynamic plugins are per-session and in-memory — they disappear when the process
restarts.
