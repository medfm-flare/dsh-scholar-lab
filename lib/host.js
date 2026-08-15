// dsh-scholar-lab - packaged HOST half (profile bundle).
// npm-package form of scholar-lab/plugin.host.js (the dynamic Cordis version).
// Changes from the dynamic body:
//   - harness.defineTool      -> defineTool from @deepseek-ai/dsh-tools
//   - harness.registerTool    -> ctx.tools.register
//   - harness.handle RPCs     -> ctx.provide('scholarLab', { search, exportCsv });
//                               the client half reaches them via ctx.remote.scholarLab.*
//   - journal DB loads from the bundled data/journal-impact-factors.json via
//     import.meta.url, falling back to workspace copies.
// Runtime requirements: the base profile's `shell` service (curl fetches) and
// `fs` service (CSV file export + dev fallback data).
import { readFileSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'scholar-lab'
export const inject = ['shell', 'fs', 'tools']

export function apply(ctx, config) {

    // Google Scholar Labs itself requires a logged-in Google session and has no
    // anonymous API. This plugin queries the classic Scholar endpoint
    // (scholar.google.com/scholar), which serves the SAME index Labs is built
    // on, through the host shell service (curl).
    //
    // Journal metadata (full names, JCR impact factors, quartiles) comes from
    // the database bundled in the npm package (data/journal-impact-factors.json,
    // resolved via import.meta.url), with a fallback to workspace copies next
    // to the working directory. When no database is found the plugin degrades
    // gracefully (no IF / no full-name expansion).
    const shell = ctx.get('shell')
    if (shell === undefined) {
      console.error('scholar-lab: shell service unavailable; tools not registered')
      return
    }

    const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

    function decodeHtml(s) {
      if (typeof s !== 'string') return ''
      return s
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&hellip;/gi, '\u2026')
        .replace(/&ndash;/gi, '\u2013')
        .replace(/&mdash;/gi, '\u2014')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&#x27;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)) })
        .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)) })
        .replace(/\s+/g, ' ')
        .trim()
    }

    async function fetchText(url) {
      const spec = shell.resolve({
        command: "curl -sSL --compressed --max-time 25 -A '" + UA + "' -H 'Accept-Language: en' '" + url + "'",
        timeoutMs: 30000,
        stdoutMaxBytes: 6000000
      })
      const res = await shell.run(spec)
      if (res.timedOut || res.aborted) throw new Error('fetch timed out')
      if (res.exitCode !== 0) {
        const err = res.stderr && res.stderr.text ? res.stderr.text.slice(0, 160) : ''
        throw new Error('fetch failed (curl exit ' + res.exitCode + ')' + (err ? ': ' + err : ''))
      }
      return (res.stdout && res.stdout.text) || ''
    }

    const cache = new Map()
    function cacheGet(key, ttlMs) {
      const hit = cache.get(key)
      if (hit && Date.now() - hit.t < ttlMs) return hit.v
      return undefined
    }
    function cachePut(key, value) {
      if (cache.size > 100) cache.delete(cache.keys().next().value)
      cache.set(key, { t: Date.now(), v: value })
    }

    // ---- journal database (full names + JCR impact factors) ----------------

    function normalizeName(s) {
      return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
    }

    var STOPWORDS = new Set(['and', 'of', 'the', 'on', 'for', 'in', 'a', 'an', 'at', 'to', 'is', 'its'])
    var WORD_ABBR = {
      transactions: 'trans', journal: 'j', letters: 'lett', letter: 'lett', reviews: 'rev', review: 'rev',
      proceedings: 'proc', international: 'int', communications: 'commun', computers: 'comput', computer: 'comput',
      systems: 'syst', engineering: 'eng', mathematics: 'math', medicine: 'med', medical: 'med', biology: 'biol',
      chemistry: 'chem', physics: 'phys', science: 'sci', sciences: 'sci', research: 'res', association: 'assoc',
      american: 'am', applied: 'appl', molecular: 'mol', cellular: 'cell', experimental: 'exp', clinical: 'clin',
      european: 'eur', society: 'soc', materials: 'mater', mechanics: 'mech', mechanical: 'mech', electrical: 'electr',
      electronics: 'electron', information: 'inf', intelligence: 'intell', machine: 'mach', learning: 'learn',
      natural: 'nat', nature: 'nat', national: 'natl', academy: 'acad', mathematical: 'math', physical: 'phys',
      biological: 'biol', chemical: 'chem', pharmacological: 'pharmacol', psychology: 'psychol', psychiatry: 'psychiatry',
      neurosciences: 'neurosci', neuroscience: 'neurosci', education: 'educ', environmental: 'environ',
      occupational: 'occup', health: 'health', public: 'public', statistics: 'stat', statistical: 'stat',
      analysis: 'anal', analytical: 'anal', processing: 'process', new: 'n', england: 'engl', quarterly: 'q',
      monthly: 'mon', annual: 'ann', yearbook: 'yearb', bulletin: 'bull', archives: 'arch', advances: 'adv',
      advance: 'adv'
    }
    // Well-known short aliases whose scholarly form cannot be derived mechanically.
    var CURATED_ALIASES = {
      jama: 'JAMA-JOURNAL OF THE AMERICAN MEDICAL ASSOCIATION',
      nejm: 'NEW ENGLAND JOURNAL OF MEDICINE',
      pnas: 'PROCEEDINGS OF THE NATIONAL ACADEMY OF SCIENCES OF THE UNITED STATES OF AMERICA',
      bmj: 'BMJ-British Medical Journal'
    }

    function aliasOf(name) {
      let s = normalizeName(name)
      s = s.replace('united states of america', 'usa').replace('united states', 'usa').replace('united kingdom', 'uk')
      const words = s.split(' ')
      const out = []
      for (let i = 0; i < words.length; i++) {
        const w = words[i]
        if (!w || STOPWORDS.has(w)) continue
        out.push(WORD_ABBR[w] || w)
      }
      return out.join(' ')
    }

    var journalDbPromise = null
    function getJournalDb() {
      if (!journalDbPromise) journalDbPromise = loadJournalDb()
      return journalDbPromise
    }

    function indexJournals(text) {
      const data = JSON.parse(text)
      const byName = new Map()
      const byAlias = new Map()
      const list = Array.isArray(data.journals) ? data.journals : []
      for (let i = 0; i < list.length; i++) {
        const j = list[i]
        if (!j || typeof j.n !== 'string' || !j.n) continue
        const nk = normalizeName(j.n)
        if (nk && !byName.has(nk)) byName.set(nk, j)
        const ak = aliasOf(j.n)
        if (ak && !byAlias.has(ak)) byAlias.set(ak, j)
      }
      for (const alias in CURATED_ALIASES) {
        const j = byName.get(normalizeName(CURATED_ALIASES[alias]))
        if (j && !byAlias.has(alias)) byAlias.set(alias, j)
      }
      return { byName: byName, byAlias: byAlias, sortedNames: Array.from(byName.keys()).sort() }
    }

    async function loadJournalDb() {
      // (1) Bundled JCR database shipped inside the npm package.
      try {
        const bundledUrl = new URL('../data/journal-impact-factors.json', import.meta.url)
        return indexJournals(readFileSync(bundledUrl, 'utf8'))
      } catch (e) {
        console.error('scholar-lab: bundled journal db unavailable: ' + String((e && e.message) || e))
      }
      // (2) Fallback: workspace copies next to the working directory (dev).
      const fs = ctx.get('fs')
      if (fs === undefined) {
        console.error('scholar-lab: fs service unavailable; journal database disabled')
        return null
      }
      const candidates = ['scholar-lab/journal-impact-factors.json', 'journal-impact-factors.json']
      for (let c = 0; c < candidates.length; c++) {
        try {
          const target = await fs.resolve(candidates[c])
          const info = await fs.stat(target)
          if (!info) continue
          return indexJournals(await fs.readText(target))
        } catch (e) {
          console.error('scholar-lab: journal db load failed for ' + candidates[c] + ': ' + String((e && e.message) || e))
        }
      }
      return null
    }

    async function lookupJournal(venueRaw) {
      const db = await getJournalDb()
      if (!db) return null
      const v = normalizeName(venueRaw)
      if (!v) return null
      const candidates = [v]
      if (v.indexOf('the ') === 0) candidates.push(v.slice(4))
      for (let c = 0; c < candidates.length; c++) {
        const cand = candidates[c]
        var hit = db.byAlias.get(cand)
        if (!hit) hit = db.byName.get(cand)
        if (!hit && cand.length >= 8) {
          let longest = null
          const names = db.sortedNames
          for (let i = 0; i < names.length; i++) {
            const k = names[i]
            if (k.length > (longest ? longest.length : 0) && k.indexOf(cand) === 0) longest = k
          }
          if (longest) hit = db.byName.get(longest)
        }
        if (hit) return hit
      }
      return null
    }

    // ---- Google Scholar result parsing -------------------------------------

    function parseRow(rowHtml, index) {
      const out = {
        index: index, title: '', authors: [], authors_raw: '', venue: '', publisher: '',
        year: 0, cited_by: 0, snippet: '', link: '', pdf: '', versions: 0,
        cluster_id: '', cites_id: '', result_id: '',
        journal_full: '', impact_factor: 0, jif_quartile: ''
      }
      const idm = rowHtml.match(/<div class="gs_r[^"]*" data-cid="([^"]*)"/)
      if (idm) out.result_id = idm[1]
      const rt = rowHtml.match(/<h3 class="gs_rt"[^>]*>([\s\S]*?)<\/h3>/)
      if (rt) {
        let inner = rt[1]
        const am = inner.match(/<a[^>]*href="([^"]*)"[^>]*>/)
        if (am) {
          out.link = am[1].replace(/&amp;/g, '&')
          inner = inner.replace(am[0], '')
        }
        // Scholar sometimes prefixes the title with format labels such as
        // [HTML][HTML] or [PDF] (gs_ctg1/gs_ctg2 spans): drop a leading run of
        // bracket tokens so titles stay clean.
        out.title = decodeHtml(inner).replace(/^(?:\[[A-Za-z0-9]+\]\s*)+/, '').trim()
      }
      const aa = rowHtml.match(/<div class="gs_a">([\s\S]*?)<\/div>/)
      if (aa) {
        const at = decodeHtml(aa[1])
        const parts = at.split(' - ')
        out.authors_raw = parts[0].trim()
        out.authors = out.authors_raw.split(',').map(function (s) { return s.trim() }).filter(Boolean)
        const rest = parts.slice(1).join(' - ')
        const ym = rest.match(/\b(?:19|20)\d{2}\b/)
        if (ym) {
          out.year = parseInt(ym[0], 10)
          const yi = rest.indexOf(ym[0])
          out.venue = rest.slice(0, yi).replace(/[,:\s]+$/, '')
          out.publisher = rest.slice(yi + 4).replace(/^\s*-\s*/, '')
        } else {
          out.venue = rest.replace(/[,:\s]+$/, '')
        }
      }
      const rs = rowHtml.match(/<div class="gs_rs">([\s\S]*?)<\/div>/)
      if (rs) out.snippet = decodeHtml(rs[1])
      const cb = rowHtml.match(/Cited by ([0-9,]+)/)
      if (cb) out.cited_by = parseInt(cb[1].replace(/,/g, ''), 10)
      const ci = rowHtml.match(/href="\/scholar\?cites=([0-9]+)/)
      if (ci) out.cites_id = ci[1]
      const ve = rowHtml.match(/All ([0-9,]+) versions/)
      if (ve) out.versions = parseInt(ve[1].replace(/,/g, ''), 10)
      const cl = rowHtml.match(/href="\/scholar\?cluster=([0-9]+)/)
      if (cl) out.cluster_id = cl[1]
      const gg = rowHtml.match(/<div class="gs_ggsd">([\s\S]*?)<\/div>\s*<\/div>/)
      if (gg) {
        const pm = gg[1].match(/<a href="([^"]*)"[^>]*>[\s\S]*?<span class="gs_ctg2">\[?[A-Za-z]+\]?<\/span>/)
        if (pm) out.pdf = pm[1].replace(/&amp;/g, '&')
      }
      return out
    }

    async function parseResults(html, start) {
      const results = []
      const starts = []
      const rowRe = /<div class="gs_r gs_or[^"]*"/g
      let m
      while ((m = rowRe.exec(html)) !== null) {
        if (m[0].indexOf('gs_ad') === -1) starts.push(m.index)
      }
      for (let i = 0; i < starts.length; i++) {
        const begin = starts[i]
        const end = i + 1 < starts.length ? starts[i + 1] : html.length
        const row = parseRow(html.slice(begin, end), start + i + 1)
        if (row.title) results.push(row)
      }
      for (let i = 0; i < results.length; i++) {
        const j = await lookupJournal(results[i].venue)
        if (j) {
          results[i].journal_full = j.n
          results[i].impact_factor = typeof j.i === 'number' ? j.i : 0
          results[i].jif_quartile = j.q || ''
        }
      }
      return results
    }

    async function runSearch(query, maxResults, start, year, lang) {
      const key = 's\u0001' + query + '\u0001' + maxResults + '\u0001' + start + '\u0001' + year + '\u0001' + lang
      const hit = cacheGet(key, 600000)
      if (hit !== undefined) return hit
      let url = 'https://scholar.google.com/scholar?hl=' + encodeURIComponent(lang || 'en') +
        '&q=' + encodeURIComponent(query) +
        '&num=' + Math.min(Math.max(maxResults, 1), 20)
      if (start > 0) url += '&start=' + start
      const ym = String(year || '').match(/^(\d{4})(?:-(\d{4}))?$/)
      if (ym) {
        url += '&as_ylo=' + ym[1]
        if (ym[2]) url += '&as_yhi=' + ym[2]
      }
      let html = ''
      try {
        html = await fetchText(url)
      } catch (e) {
        const v = { query: query, error: String((e && e.message) || e), count: 0, results: [] }
        cachePut(key, v)
        return v
      }
      if (!html) {
        const v = { query: query, error: 'empty response from Google Scholar', count: 0, results: [] }
        cachePut(key, v)
        return v
      }
      if (/unusual traffic|gs_captcha_f|enablejs=1/i.test(html)) {
        const v = { query: query, error: 'Google Scholar blocked the request (unusual-traffic / CAPTCHA check). Wait a moment and try again with a different query or network.', count: 0, results: [] }
        cachePut(key, v)
        return v
      }
      if (/did not match any articles/i.test(html)) {
        const v = { query: query, about: '', count: 0, results: [] }
        cachePut(key, v)
        return v
      }
      const results = await parseResults(html, start)
      const aboutMatch = html.match(/About ([0-9,]+) results/)
      const v = { query: query, about: aboutMatch ? aboutMatch[1] : '', count: results.length, results: results }
      cachePut(key, v)
      return v
    }

    // ---- abstract / publisher metadata --------------------------------------

    function metaTag(html, name, attr) {
      const attrName = attr || 'name'
      const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const tagRe = /<meta\b[^>]*>/gi
      let m
      while ((m = tagRe.exec(html)) !== null) {
        if (new RegExp(attrName + '=["\']' + safe + '["\']', 'i').test(m[0])) {
          const cm = m[0].match(/content=["\']([^"\']*)["\']/i)
          if (cm) return decodeHtml(cm[1])
        }
      }
      return ''
    }

    function metaAll(html, name) {
      const out = []
      const tagRe = /<meta\b[^>]*>/gi
      let m
      while ((m = tagRe.exec(html)) !== null) {
        if (new RegExp('name=["\']' + name + '["\']', 'i').test(m[0])) {
          const cm = m[0].match(/content=["\']([^"\']*)["\']/i)
          if (cm) out.push(decodeHtml(cm[1]))
        }
      }
      return out
    }

    async function fetchAbstract(url) {
      const u = String(url || '').trim()
      const empty = { url: u, title: '', abstract: '', authors: [], journal: '', journal_full: '', impact_factor: 0, jif_quartile: '', date: '', volume: '', issue: '', pages: '', doi: '', publisher: '', pdf: '', error: '' }
      if (!/^https?:\/\//i.test(u) || u.length > 2048) {
        return Object.assign({}, empty, { error: 'invalid URL (must be http/https)' })
      }
      const key = 'a\u0001' + u
      const hit = cacheGet(key, 1800000)
      if (hit !== undefined) return hit
      let html = ''
      try {
        html = await fetchText(u)
      } catch (e) {
        const v = Object.assign({}, empty, { error: String((e && e.message) || e) })
        cachePut(key, v)
        return v
      }
      if (!html) {
        const v = Object.assign({}, empty, { error: 'empty response' })
        cachePut(key, v)
        return v
      }
      const out = {
        url: u,
        title: metaTag(html, 'citation_title', 'name') || metaTag(html, 'DC.Title', 'name'),
        abstract: metaTag(html, 'citation_abstract', 'name') || metaTag(html, 'og:description', 'property') || metaTag(html, 'description', 'name'),
        authors: [],
        journal: metaTag(html, 'citation_journal_title', 'name'),
        journal_full: '',
        impact_factor: 0,
        jif_quartile: '',
        date: metaTag(html, 'citation_publication_date', 'name') || metaTag(html, 'citation_date', 'name'),
        volume: metaTag(html, 'citation_volume', 'name'),
        issue: metaTag(html, 'citation_issue', 'name'),
        pages: '',
        doi: metaTag(html, 'citation_doi', 'name'),
        publisher: metaTag(html, 'citation_publisher', 'name'),
        pdf: metaTag(html, 'citation_pdf_url', 'name'),
        error: ''
      }
      if (out.journal) {
        const j = await lookupJournal(out.journal)
        if (j) {
          out.journal_full = j.n
          out.impact_factor = typeof j.i === 'number' ? j.i : 0
          out.jif_quartile = j.q || ''
        } else {
          out.journal_full = out.journal
        }
      }
      const authors = metaAll(html, 'citation_author')
      if (authors.length === 0) {
        const dc = metaTag(html, 'DC.Creator', 'name')
        if (dc) authors.push.apply(authors, dc.split(';').map(function (s) { return s.trim() }).filter(Boolean))
      }
      out.authors = authors
      const fp = metaTag(html, 'citation_firstpage', 'name')
      const lp = metaTag(html, 'citation_lastpage', 'name')
      if (fp) out.pages = lp && lp !== fp ? fp + '-' + lp : fp
      if (!out.title) {
        const tm = html.match(/<title>([\s\S]*?)<\/title>/i)
        if (tm) out.title = decodeHtml(tm[1])
      }
      if (out.abstract) out.abstract = out.abstract.slice(0, 6000)
      cachePut(key, out)
      return out
    }

    // ---- CSV export ---------------------------------------------------------

    function csvField(v) {
      const s = v == null ? '' : String(v)
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
      return s
    }

    function buildCsv(query, rows) {
      const headers = ['index', 'title', 'authors', 'journal', 'journal_abbrev', 'impact_factor', 'jif_quartile', 'publication_date', 'year', 'volume', 'issue', 'pages', 'doi', 'publisher', 'cited_by', 'abstract', 'snippet', 'link', 'pdf', 'cluster_id', 'cites_id', 'result_id']
      const lines = [headers.map(csvField).join(',')]
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        lines.push([
          r.index || i + 1,
          r.title || '',
          (r.authors || []).join('; '),
          r.journal_full || r.venue || '',
          r.venue || '',
          r.impact_factor || 0,
          r.jif_quartile || '',
          r.publication_date || r.date || '',
          r.year || 0,
          r.volume || '',
          r.issue || '',
          r.pages || '',
          r.doi || '',
          r.publisher || '',
          r.cited_by || 0,
          r.abstract || '',
          r.snippet || '',
          r.link || '',
          r.pdf || '',
          r.cluster_id || '',
          r.cites_id || '',
          r.result_id || ''
        ].map(csvField).join(','))
      }
      return lines.join('\n') + '\n'
    }

    function slugOf(s) {
      return String(s || 'results').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'results'
    }

    function stamp() {
      const d = new Date()
      const p = function (n) { return (n < 10 ? '0' : '') + n }
      return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
    }

    async function writeCsvFile(content, slug) {
      const name = 'scholar-lab/scholar-export-' + slug + '-' + stamp() + '.csv'
      const fs = ctx.get('fs')
      if (fs !== undefined) {
        const target = await fs.resolve(name)
        await fs.writeText(target, content)
        return fs.processPath(target)
      }
      const b64 = btoa(content)
      const spec = shell.resolve({
        command: "echo '" + b64 + "' | base64 -d > '" + name + "'",
        timeoutMs: 15000
      })
      const res = await shell.run(spec)
      if (res.exitCode !== 0) {
        const err = res.stderr && res.stderr.text ? res.stderr.text.slice(0, 120) : 'exit ' + res.exitCode
        throw new Error('failed to write CSV: ' + err)
      }
      return name
    }

    async function enrichResult(r, withDetails) {
      const row = Object.assign({}, r)
      if (withDetails && row.link) {
        try {
          const d = await fetchAbstract(row.link)
          if (d && !d.error) {
            row.abstract = d.abstract || row.snippet || ''
            row.publication_date = d.date
            row.doi = d.doi
            row.volume = d.volume
            row.issue = d.issue
            row.pages = d.pages
            row.publisher = d.publisher || row.publisher
            if (d.journal) {
              row.venue = d.journal
              row.journal_full = d.journal_full || d.journal
              row.impact_factor = d.impact_factor || row.impact_factor
              row.jif_quartile = d.jif_quartile || row.jif_quartile
            }
          }
        } catch (e) { /* keep base row on failure */ }
      }
      return row
    }

    async function enrichBatch(rows, withDetails) {
      const out = new Array(rows.length)
      let next = 0
      async function worker() {
        while (true) {
          const i = next++
          if (i >= rows.length) return
          out[i] = await enrichResult(rows[i], withDetails)
        }
      }
      await Promise.all([worker(), worker(), worker()])
      return out
    }

    function fmtNum(n) {
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    // ---- tools --------------------------------------------------------------

    const searchTool = defineTool({
      name: 'scholar_search',
      description: 'Search Google Scholar for academic papers and return structured metadata: title, authors, full journal name (when resolvable), JCR impact factor + quartile (when known), year, cited-by count, abstract-excerpt snippet, PDF link, versions, cluster id. Uses the same Google Scholar index that powers Scholar Labs (Labs itself requires a Google login and cannot be called programmatically). Set export_csv to also write a CSV file of the results into the workspace and return its path. Use scholar_abstract on a result link to fetch the full abstract.',
      parameters: {
        query: { type: 'string', required: true, description: 'Search query, e.g. "attention is all you need" or "transformer time series forecasting"' },
        max_results: { type: 'integer', description: 'Number of results to return (1-20, default 10)', default: 10 },
        start: { type: 'integer', description: 'Result offset for pagination, in steps of 10 (0 = first page)', default: 0 },
        year: { type: 'string', description: 'Year filter, e.g. "2020" or "2018-2023" (optional)' },
        lang: { type: 'string', description: 'Interface language code, default "en"', default: 'en' },
        export_csv: { type: 'boolean', description: 'When true, also write the results to a CSV file in the workspace (scholar-lab/scholar-export-*.csv) and return its path in csv_path. (The Download CSV button in the UI downloads to the browser instead.)', default: false }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            query: { type: 'string' },
            about: { type: 'string' },
            count: { type: 'integer' },
            error: { type: 'string' },
            csv_path: { type: 'string' },
            results: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  index: { type: 'integer' },
                  title: { type: 'string' },
                  authors: { type: 'array', items: { type: 'string' } },
                  authors_raw: { type: 'string' },
                  venue: { type: 'string' },
                  journal_full: { type: 'string' },
                  impact_factor: { type: 'number' },
                  jif_quartile: { type: 'string' },
                  publisher: { type: 'string' },
                  year: { type: 'integer' },
                  cited_by: { type: 'integer' },
                  snippet: { type: 'string' },
                  link: { type: 'string' },
                  pdf: { type: 'string' },
                  versions: { type: 'integer' },
                  cluster_id: { type: 'string' },
                  cites_id: { type: 'string' },
                  result_id: { type: 'string' }
                }
              }
            }
          }
        },
        render: function (args, value) {
          if (!value || typeof value !== 'object') return [{ type: 'text', text: String(value) }]
          if (value.error) return [{ type: 'text', text: 'Google Scholar search failed: ' + value.error }]
          const lines = []
          lines.push('### Google Scholar: "' + value.query + '"' + (value.about ? ' — about ' + value.about + ' results' : ''))
          for (let i = 0; i < (value.results || []).length; i++) {
            const r = value.results[i]
            lines.push('')
            lines.push('**' + r.index + '. ' + r.title + '**')
            const metaLine = [r.authors_raw, r.journal_full || r.venue, r.year > 0 ? String(r.year) : '', r.publisher].filter(Boolean).join(' · ')
            if (metaLine) lines.push(metaLine)
            const badges = []
            if (r.cited_by > 0) badges.push('Cited by ' + fmtNum(r.cited_by))
            if (r.impact_factor > 0) badges.push('JCR IF ' + r.impact_factor + (r.jif_quartile ? ' (' + r.jif_quartile + ')' : ''))
            if (r.versions > 0) badges.push(r.versions + ' versions')
            if (badges.length) lines.push(badges.join(' · '))
            if (r.snippet) lines.push('Snippet: ' + r.snippet.slice(0, 400))
            if (r.link) lines.push('URL: ' + r.link)
            else if (r.cluster_id) lines.push('Scholar: https://scholar.google.com/scholar?cluster=' + r.cluster_id)
          }
          if (!value.results || value.results.length === 0) lines.push('_No results returned._')
          if (value.csv_path) lines.push('')
          if (value.csv_path) lines.push('CSV export: ' + value.csv_path)
          return [{ type: 'text', text: lines.join('\n') }]
        },
        presentationMeta: function (args, value) { return value }
      },
      execute: async function (args) {
        const a = args || {}
        const query = String(a.query || '').trim()
        const maxResults = Math.min(Math.max(parseInt(a.max_results, 10) || 10, 1), 20)
        const start = Math.max(parseInt(a.start, 10) || 0, 0)
        const year = String(a.year || '')
        const lang = String(a.lang || 'en')
        const exportCsv = !!a.export_csv
        if (!query) return { query: '', error: 'query is required', count: 0, results: [], csv_path: '' }
        const v = await runSearch(query, maxResults, start, year, lang)
        if (exportCsv && v.results && v.results.length > 0) {
          try {
            const csv = buildCsv(query, v.results)
            v.csv_path = await writeCsvFile(csv, slugOf(query))
          } catch (e) {
            v.csv_path = ''
            v.error = (v.error ? v.error + '; ' : '') + 'CSV export failed: ' + String((e && e.message) || e)
          }
        } else {
          v.csv_path = ''
        }
        return v
      }
    })

    const abstractTool = defineTool({
      name: 'scholar_abstract',
      description: 'Fetch the full abstract and bibliographic metadata of one paper page (a Google Scholar result link from scholar_search, or any paper URL). Extracts HighWire-style citation_* meta tags (title, abstract, authors, journal, publication date, volume, issue, pages, DOI, publisher, PDF) when the publisher exposes them, with og:description as fallback, plus JCR impact factor/quartile when the journal is in the bundled database. Best effort: some publisher pages block automated fetching.',
      parameters: {
        url: { type: 'string', required: true, description: 'Paper URL, e.g. the link field of a scholar_search result' }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            abstract: { type: 'string' },
            authors: { type: 'array', items: { type: 'string' } },
            journal: { type: 'string' },
            journal_full: { type: 'string' },
            impact_factor: { type: 'number' },
            jif_quartile: { type: 'string' },
            date: { type: 'string' },
            volume: { type: 'string' },
            issue: { type: 'string' },
            pages: { type: 'string' },
            doi: { type: 'string' },
            publisher: { type: 'string' },
            pdf: { type: 'string' },
            error: { type: 'string' }
          }
        },
        render: function (args, value) {
          if (!value || typeof value !== 'object') return [{ type: 'text', text: String(value) }]
          if (value.error) return [{ type: 'text', text: 'Abstract fetch failed: ' + value.error }]
          const lines = ['### ' + (value.title || value.url)]
          if (value.authors && value.authors.length) lines.push(value.authors.join(', '))
          const meta = [value.journal_full || value.journal, value.date, value.volume ? 'vol. ' + value.volume : '', value.issue ? 'no. ' + value.issue : '', value.pages].filter(Boolean).join(', ')
          if (meta) lines.push(meta)
          if (value.impact_factor > 0) lines.push('JCR IF ' + value.impact_factor + (value.jif_quartile ? ' (' + value.jif_quartile + ')' : ''))
          if (value.doi) lines.push('DOI: ' + value.doi)
          lines.push('')
          lines.push(value.abstract ? value.abstract : '_No abstract found on this page._')
          if (value.pdf) lines.push('PDF: ' + value.pdf)
          return [{ type: 'text', text: lines.join('\n') }]
        },
        presentationMeta: function (args, value) { return value }
      },
      execute: async function (args) {
        const a = args || {}
        return fetchAbstract(String(a.url || ''))
      }
    })

    ctx.effect(function () {
      const d1 = ctx.tools.register(searchTool)
      const d2 = ctx.tools.register(abstractTool)
      ctx.provide('scholarLab', {
        search: async function (args) {
        const a = (args && typeof args === 'object') ? args : {}
        const query = String(a.query || '').trim()
        if (!query) return { error: 'query is required', query: '', count: 0, results: [] }
        const maxResults = Math.min(Math.max(parseInt(a.maxResults, 10) || 10, 1), 20)
        const start = Math.max(parseInt(a.start, 10) || 0, 0)
        try {
          return await runSearch(query, maxResults, start, '', 'en')
        } catch (e) {
          return { error: String((e && e.message) || e), query: query, count: 0, results: [] }
        }
        },
      // Builds the CSV in memory and hands it to the browser for download — no
      // file is written on the host machine.
        exportCsv: async function (args) {
        const a = (args && typeof args === 'object') ? args : {}
        const query = String(a.query || '').trim()
        const results = Array.isArray(a.results) ? a.results : []
        const withDetails = !!a.withDetails
        if (!query || results.length === 0) return { error: 'no results to export', csv: '', filename: '', rows: 0 }
        try {
          const enriched = await enrichBatch(results, withDetails)
          const csv = buildCsv(query, enriched)
          const filename = 'scholar-export-' + slugOf(query) + '-' + stamp() + '.csv'
          return { error: '', csv: csv, filename: filename, rows: enriched.length }
        } catch (e) {
          return { error: String((e && e.message) || e), csv: '', filename: '', rows: 0 }
        }
        },
      })
      return function () { d1(); d2() }
    })
  }

