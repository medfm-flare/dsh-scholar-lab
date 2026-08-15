// dsh-scholar-lab - packaged CLIENT half (browser bundle).
// npm-package form of scholar-lab/plugin.client.js (the dynamic Cordis
// version), converted to the web-shell module-table bundle format:
//   - wrapped in window.__ModuleLoader__.load({ id, factory })
//   - styles.insert(...)          -> local insertCss(...) (same style-tag effect)
//   - host.call('scholar-search') / host.call('scholar-export')
//                               -> fetch('/scholar-lab/search') / fetch('/scholar-lab/export')
//     (the host half registers those same-origin webServer routes; see lib/host.js)
//   - React is required from the module table instead of arriving as a global.
window.__ModuleLoader__.load({
  id: '@junma11/dsh-scholar-lab',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require('react')

    function insertCss(css) {
      const tag = document.createElement('style')
      tag.textContent = css
      document.head.appendChild(tag)
    }

    const inject = ['slots']

    // Community plugins have no remote.* typert namespace on the client, so
    // browser-to-host calls go over the plain same-origin HTTP routes the host
    // half registers (see lib/host.js — the dshmarket pattern).
    function callHost(path, payload) {
      return fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {})
      }).then(function (res) {
        return res.json().catch(function () {
          return { error: 'invalid server response (HTTP ' + res.status + ')' }
        })
      })
    }

function apply(ctx) {

    const slots = ctx.get('slots')
    if (slots === undefined) return

    insertCss('.schl-panel{display:flex;flex-direction:column;gap:8px;padding:10px 12px;font-size:13px;}.schl-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}.schl-panel-title{font-weight:600;color:var(--dsw-alias-label-primary);}.schl-panel-link{color:var(--dsw-alias-brand-primary);text-decoration:none;font-size:12px;}.schl-searchrow{display:flex;gap:8px;}.schl-input{flex:1;min-width:0;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;outline:none;}.schl-input:focus{border-color:var(--dsw-alias-brand-primary);}.schl-btn{padding:6px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px;}.schl-btn:disabled{opacity:.5;cursor:default;}.schl-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);}.schl-results{display:flex;flex-direction:column;gap:10px;}.schl-query{font-weight:600;color:var(--dsw-alias-label-primary);font-size:13px;}.schl-about{color:var(--dsw-alias-label-secondary);font-size:12px;}.schl-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:4px;}.schl-title{font-weight:600;color:var(--dsw-alias-label-primary);}.schl-title a{color:var(--dsw-alias-brand-primary);text-decoration:none;}.schl-meta{color:var(--dsw-alias-label-secondary);font-size:12px;}.schl-snippet{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45;}.schl-abstract{color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.5;}.schl-actions{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;align-items:center;}.schl-badge{color:var(--dsw-alias-state-success-primary);font-weight:600;}.schl-if{color:var(--dsw-alias-state-warn-primary);font-weight:600;}.schl-link{color:var(--dsw-alias-brand-primary);text-decoration:none;}.schl-path{font-family:monospace;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all;}.schl-running{color:var(--dsw-alias-label-secondary);font-size:12px;}.schl-error{color:var(--dsw-alias-state-error-primary);font-size:12px;}.schl-raw{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:pre-wrap;}.schl-more{display:flex;justify-content:center;}')

    function fmtNum(n) {
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    function downloadCsv(filename, csv) {
      try {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
      } catch (e) {
        throw new Error('browser download failed: ' + String((e && e.message) || e))
      }
    }

    function IfBadge(r) {
      if (!r.impact_factor || r.impact_factor <= 0) return null
      const label = 'IF ' + (r.impact_factor % 1 === 0 ? String(r.impact_factor) : r.impact_factor.toFixed(1)) + (r.jif_quartile ? ' · ' + r.jif_quartile : '')
      return React.createElement('span', { className: 'schl-if' }, label)
    }

    function ResultsList(props) {
      const results = props.results || []
      const about = props.about
      const query = props.query
      return React.createElement('div', { className: 'schl-results' },
        query ? React.createElement('div', { className: 'schl-query' }, 'Search: “' + query + '”') : null,
        about ? React.createElement('div', { className: 'schl-about' }, 'About ' + about + ' results') : null,
        results.map(function (r) {
          const metaParts = [r.authors_raw, r.journal_full || r.venue, r.year > 0 ? String(r.year) : '', r.publisher].filter(Boolean)
          return React.createElement('div', { className: 'schl-card', key: 'r' + (r.result_id || r.index) },
            React.createElement('div', { className: 'schl-title' },
              r.link
                ? React.createElement('a', { href: r.link, target: '_blank', rel: 'noreferrer' }, r.title)
                : r.title),
            metaParts.length ? React.createElement('div', { className: 'schl-meta' }, metaParts.join(' · ')) : null,
            r.snippet ? React.createElement('div', { className: 'schl-snippet' }, r.snippet) : null,
            React.createElement('div', { className: 'schl-actions' },
              r.cited_by > 0 ? React.createElement('span', { className: 'schl-badge' }, 'Cited by ' + fmtNum(r.cited_by)) : null,
              React.createElement(IfBadge, { impact_factor: r.impact_factor, jif_quartile: r.jif_quartile }),
              r.cluster_id ? React.createElement('a', { className: 'schl-link', href: 'https://scholar.google.com/scholar?cluster=' + r.cluster_id, target: '_blank', rel: 'noreferrer' }, 'All versions') : null,
              r.pdf ? React.createElement('a', { className: 'schl-link', href: r.pdf, target: '_blank', rel: 'noreferrer' }, 'PDF') : null,
              r.link ? React.createElement('a', { className: 'schl-link', href: r.link, target: '_blank', rel: 'noreferrer' }, 'Paper') : null)
          )
        })
      )
    }

    function textOf(block) {
      const out = []
      const content = block && block.content
      if (Array.isArray(content)) {
        for (let i = 0; i < content.length; i++) {
          const b = content[i]
          if (b && b.type === 'text' && typeof b.text === 'string') out.push(b.text)
        }
      }
      return out.join('\n')
    }

    function useExport(defaults) {
      const [exporting, setExporting] = React.useState(false)
      const [exportResult, setExportResult] = React.useState(null)
      const [withDetails, setWithDetails] = React.useState(defaults.withDetails || false)
      const doExport = function (query, results) {
        if (!query || !results || !results.length || exporting) return
        setExporting(true)
        setExportResult(null)
        callHost('/scholar-lab/export', { query: query, results: results, withDetails: withDetails })
          .then(function (res) {
            if (res && typeof res === 'object' && !res.error && typeof res.csv === 'string' && res.csv.length) {
              downloadCsv(res.filename || 'scholar-export.csv', res.csv)
              setExportResult({ filename: res.filename || 'scholar-export.csv', rows: res.rows || 0 })
            } else {
              setExportResult(res && typeof res === 'object' ? res : { error: 'unexpected export response' })
            }
          })
          .catch(function (e) {
            setExportResult({ error: String((e && e.message) || e) })
          })
          .finally(function () { setExporting(false) })
      }
      return { exporting: exporting, exportResult: exportResult, withDetails: withDetails, setWithDetails: setWithDetails, doExport: doExport }
    }

    function ExportRow(props) {
      const exp = props.export
      const query = props.query
      const results = props.results
      let status = null
      if (exp.exportResult) {
        if (exp.exportResult.error) {
          status = React.createElement('span', { className: 'schl-error' }, 'Export failed: ' + exp.exportResult.error)
        } else {
          status = React.createElement('span', { className: 'schl-path' }, 'Downloaded ' + exp.exportResult.filename)
        }
      }
      return React.createElement('div', { className: 'schl-actions' },
        React.createElement('label', { className: 'schl-check' },
          React.createElement('input', { type: 'checkbox', checked: exp.withDetails, onChange: function (e) { exp.setWithDetails(e.target.checked) }, disabled: exp.exporting }),
          'include full details (abstract/DOI/date)'),
        React.createElement('button', { className: 'schl-btn', onClick: function () { exp.doExport(query, results) }, disabled: exp.exporting || !results || !results.length },
          exp.exporting ? 'Preparing…' : ('Download CSV' + (results && results.length > 10 ? ' (' + results.length + ' papers)' : ''))),
        status
      )
    }

    function ScholarSearchView(props) {
      const block = props.block
      if (!block) return null
      if (block.kind === 'tool-result') {
        const meta = block.meta
        if (meta && typeof meta === 'object' && Array.isArray(meta.results)) {
          if (meta.error && meta.results.length === 0) {
            return React.createElement('div', { className: 'schl-error' }, meta.error)
          }
          const exp = useExport({ withDetails: false })
          return React.createElement('div', null,
            React.createElement(ResultsList, { results: meta.results, about: meta.about, query: meta.query }),
            React.createElement(ExportRow, { export: exp, query: meta.query, results: meta.results }))
        }
        return React.createElement('div', { className: 'schl-raw' }, textOf(block))
      }
      let q = ''
      try {
        const args = JSON.parse(block.argsRaw || '{}')
        q = typeof args.query === 'string' ? args.query : ''
      } catch (e) { /* ignore */ }
      return React.createElement('div', { className: 'schl-running' },
        'Searching Google Scholar' + (q ? ' for “' + q + '”' : '') + '…')
    }

    function ScholarAbstractView(props) {
      const block = props.block
      if (!block) return null
      if (block.kind === 'tool-result') {
        const meta = block.meta
        if (meta && typeof meta === 'object' && typeof meta.abstract === 'string') {
          if (meta.error) return React.createElement('div', { className: 'schl-error' }, meta.error)
          const metaLine = [meta.journal_full || meta.journal, meta.date, meta.volume ? 'vol. ' + meta.volume : '', meta.issue ? 'no. ' + meta.issue : '', meta.pages].filter(Boolean).join(', ')
          return React.createElement('div', { className: 'schl-card' },
            React.createElement('div', { className: 'schl-title' }, meta.title || meta.url),
            meta.authors && meta.authors.length ? React.createElement('div', { className: 'schl-meta' }, meta.authors.join(', ')) : null,
            metaLine ? React.createElement('div', { className: 'schl-meta' }, metaLine) : null,
            meta.abstract
              ? React.createElement('div', { className: 'schl-abstract' }, meta.abstract)
              : React.createElement('div', { className: 'schl-snippet' }, 'No abstract found on this page.'),
            React.createElement('div', { className: 'schl-actions' },
              React.createElement(IfBadge, { impact_factor: meta.impact_factor, jif_quartile: meta.jif_quartile }),
              meta.doi ? React.createElement('a', { className: 'schl-link', href: 'https://doi.org/' + meta.doi, target: '_blank', rel: 'noreferrer' }, 'DOI') : null,
              meta.pdf ? React.createElement('a', { className: 'schl-link', href: meta.pdf, target: '_blank', rel: 'noreferrer' }, 'PDF') : null,
              React.createElement('a', { className: 'schl-link', href: meta.url, target: '_blank', rel: 'noreferrer' }, 'Open page'))
          )
        }
        return React.createElement('div', { className: 'schl-raw' }, textOf(block))
      }
      return React.createElement('div', { className: 'schl-running' }, 'Fetching abstract…')
    }

    function ScholarLabPanel(props) {
      const [query, setQuery] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [moreBusy, setMoreBusy] = React.useState(false)
      const [state, setState] = React.useState(null)
      const [error, setError] = React.useState('')
      const exp = useExport({ withDetails: false })

      const run = function () {
        const q = query.trim()
        if (!q || busy || moreBusy) return
        setBusy(true)
        setError('')
        setState(null)
        callHost('/scholar-lab/search', { query: q, maxResults: 10, start: 0 })
          .then(function (res) {
            if (res && typeof res === 'object' && res.error && !(res.results && res.results.length)) {
              setError(res.error)
            } else {
              setState({ query: q, about: (res && res.about) || '', results: (res && res.results) || [], lastFull: (res && res.results && res.results.length) === 10 })
            }
          })
          .catch(function (e) {
            setError(String((e && e.message) || e))
          })
          .finally(function () { setBusy(false) })
      }

      const loadMore = function () {
        if (!state || moreBusy || busy) return
        setMoreBusy(true)
        setError('')
        callHost('/scholar-lab/search', { query: state.query, maxResults: 10, start: state.results.length })
          .then(function (res) {
            if (res && typeof res === 'object' && res.error) {
              setError(res.error)
            } else {
              const more = (res && res.results) || []
              const seen = new Set()
              for (let i = 0; i < state.results.length; i++) seen.add(state.results[i].result_id)
              const merged = state.results.slice()
              for (let i = 0; i < more.length; i++) {
                if (!seen.has(more[i].result_id)) {
                  merged.push(more[i])
                  seen.add(more[i].result_id)
                }
              }
              setState({ query: state.query, about: (res && res.about) || state.about, results: merged, lastFull: more.length === 10 })
            }
          })
          .catch(function (e) {
            setError(String((e && e.message) || e))
          })
          .finally(function () { setMoreBusy(false) })
      }

      const canLoadMore = state !== null && state.lastFull && state.results.length > 0 && state.results.length < 100 && !busy && !moreBusy

      return React.createElement('div', { className: 'schl-panel' },
        React.createElement('div', { className: 'schl-panel-head' },
          React.createElement('span', { className: 'schl-panel-title' }, 'Google Scholar Lab'),
          React.createElement('a', { className: 'schl-panel-link', href: 'https://scholar.google.com/scholar_labs/search?hl=en&authuser=0', target: '_blank', rel: 'noreferrer' }, 'open Scholar Labs')
        ),
        React.createElement('div', { className: 'schl-searchrow' },
          React.createElement('input', {
            className: 'schl-input',
            type: 'text',
            placeholder: 'Search papers… e.g. "attention is all you need"',
            value: query,
            onChange: function (e) { setQuery(e.target.value) },
            onKeyDown: function (e) { if (e.key === 'Enter') run() },
            disabled: busy || moreBusy
          }),
          React.createElement('button', { className: 'schl-btn', onClick: run, disabled: busy || moreBusy || !query.trim() },
            busy ? 'Searching…' : 'Search')
        ),
        error ? React.createElement('div', { className: 'schl-error' }, error) : null,
        busy ? React.createElement('div', { className: 'schl-running' }, 'Searching Google Scholar…') : null,
        state ? React.createElement('div', null,
          React.createElement(ResultsList, { results: state.results, about: state.about, query: state.query }),
          React.createElement(ExportRow, { export: exp, query: state.query, results: state.results }),
          canLoadMore ? React.createElement('div', { className: 'schl-more' },
            React.createElement('button', { className: 'schl-btn', onClick: loadMore, disabled: moreBusy },
              moreBusy ? 'Loading more…' : 'Load more papers')) : null) : null
      )
    }

    slots.inject('tool.view.cordis', function () {
      return slots.register(
        { name: 'tool.view.cordis', key: 'self' },
        function (props) { return React.createElement(ScholarLabPanel, props) }
      )
    })

    slots.inject('tool.call.toolview', function () {
      const d1 = slots.register(
        { name: 'tool.call.toolview', key: 'scholar_search' },
        function (props) { return React.createElement(ScholarSearchView, props) }
      )
      const d2 = slots.register(
        { name: 'tool.call.toolview', key: 'scholar_abstract' },
        function (props) { return React.createElement(ScholarAbstractView, props) }
      )
      return function () { d1(); d2() }
    })
  }

    exports.name = 'scholar-lab-client'
    exports.inject = inject
    exports.apply = apply
    return module.exports;
  }
});
