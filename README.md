
# dsh-scholar-lab

**Google Scholar search agent for DeepSeek Harness (DSH)** — publishable as an npm
**profile bundle** (one-command install into any DSH profile) or usable as a
**dynamic Cordis plugin** (no install, per-session).

Search Google Scholar for academic papers and get structured metadata — title,
**full journal name** (when resolvable), **JCR impact factor + quartile**, authors,
year, cited-by count, abstract-excerpt snippet, PDF link, versions — plus full
abstracts from publisher pages and **CSV export** of any result set.

## Feature comparison

| Capability                                                               | This plugin (Scholar Lab for DSH)                                                 | Google Scholar Labs                                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Access**                                                         | No login needed, works from any session/host                                      | **Login required** (no anonymous API; also no CORS from third-party pages) |
| **Search source**                                                  | Same underlying Scholar index (classic endpoint)                                  | Same index, but an AI "research mode" on top                                     |
| **Structured metadata (title, authors, journal, year, citations)** | ✅ Full structured JSON per paper                                                 | ✅ (the "familiar Scholar features") but as web UI, not structured data          |
| **Full journal names**                                             | ✅ Resolved from bundled JCR database                                             | Shows venue as Scholar renders it                                                |
| **JCR impact factor + quartile**                                   | ✅ JCR 2025 (June 2026 release), 22.6k journals                                   | ❌ Scholar doesn't show IFs                                                      |
| **Full abstract + DOI, volume/issue/pages, publisher**             | ✅ via`scholar_abstract` (publisher meta tags)                                  | Labs gives summaries, not structured bibliographic records                       |
| **CSV export (all loaded papers, 22 columns)**                     | ✅ One click → downloads to your laptop                                          | ❌ No bulk/structured export                                                     |
| **Pagination / "load more"**                                       | ✅ Up to 100 papers per search                                                    | Page-based browsing, no export                                                   |
| **Use from chat / automation**                                     | ✅ Model tools`scholar_search` / `scholar_abstract` — results feed the agent | ❌ Browser UI only                                                               |

## In short

- **Scholar Labs wins on**: *understanding research questions* — AI-generated overviews, per-paper helpfulness notes, and follow-up Q&A. It's a **reading/exploration assistant**.
- **This plugin wins on**: *structured, machine-usable data* — clean metadata (title/authors/journal/year/citations), **full journal names + JCR 2025 impact factors & quartiles** (which Scholar never shows), **full abstracts + DOIs**, **bulk CSV export to your laptop**, pagination up to 100 papers, and **deep integration with the chat agent** (search results feed directly into what the assistant can reason about). No login, works everywhere.

They're complementary: use Labs when you want an AI conversation about a research area; use this plugin when you want a reproducible list of papers with bibliometrics you can export and cite-check. The panel even links to your logged-in Labs page, so both are one click apart.

## Install (profile bundle — the community path)

```sh
dsh plugin --profile web add @junma11/dsh-scholar-lab
dsh web
```

The `dsh plugin` command forwards to pnpm inside the profile; any installed
package declaring `dsh.bundle` automatically joins the profile's bundle layer
stack (`dsh.profile.bundles`) and its `cordis.patch.yml` composes into the app
config. Remove with:

```sh
dsh plugin --profile web remove @junma11/dsh-scholar-lab
```

> Requires `@deepseek-ai/dsh` ≥ 0.1.0 and the base profile's `shell` service
> (default web profile; fetches go through `curl`).

## What you get

| Surface                   | Description                                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scholar_search` tool   | Chat-side search:`query`, `max_results` (1–20), `start`, `year` (`"2020"` or `"2018-2023"`), `lang`, `export_csv` (writes `scholar-lab/scholar-export-*.csv` into the workspace via the `fs` service) |
| `scholar_abstract` tool | Full abstract + HighWire`citation_*` metadata from a result/publisher URL                                                                                                                                                |
| Search panel (UI)         | Run-card panel with search box, pagination ("Load more papers", deduped, ≤100), and**Download CSV** (browser-side, nothing written to the host)                                                                     |
| Result cards              | `scholar_search` / `scholar_abstract` result views with JCR IF badges                                                                                                                                                  |

Per-paper fields: `title, authors[], authors_raw, venue, journal_full, impact_factor, jif_quartile, publisher, year, cited_by, snippet, link, pdf, versions, cluster_id, cites_id, result_id`.

## Package layout

| File                                 | Contents                                                                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/host.js`                      | Host half:`scholar_search` / `scholar_abstract` tools (`ctx.tools.register` + `defineTool` from `@deepseek-ai/dsh-tools`), the `scholarLab` service (`ctx.provide`) for the panel, CSV writer |
| `lib/client.js`                    | Client half: browser bundle in the web-shell module-table format (`window.__ModuleLoader__.load`), search panel + tool result cards                                                                       |
| `data/journal-impact-factors.json` | JCR 2025 database (full names, IFs, quartiles) — 22,643 journals, 1.5 MB, read from the package via`import.meta.url`                                                                                     |
| `cordis.patch.yml`                 | Bundle patch layer: inserts the`scholar-lab` (host) and `scholar-lab-client` (browser roster) rows                                                                                                      |
| `scholar-lab/` (source)            | The original dynamic Cordis plugin files this package was generated from                                                                                                                                    |

## Develop & verify locally (before publishing)

```sh
# 1. Syntax / structure checks
node --check lib/host.js
node --check lib/client.js

# 2. Pack and install into a throwaway profile (or your web profile)
pnpm pack
dsh plugin --profile web add ./junma11-dsh-scholar-lab-0.1.0.tgz

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

1. **Browser → host bridge.** The client bundle talks to the host over the
   plain same-origin HTTP routes the host half registers (`/scholar-lab/search`
   and `/scholar-lab/export`, same-origin enforced on POST) — the same pattern
   dshmarket uses. `ctx.remote.*` typert namespaces are first-party only and
   must not be used by community client bundles. If you rename the routes,
   change `lib/host.js` and the `callHost` calls in `lib/client.js` together.
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
