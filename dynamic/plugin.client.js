return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert('.schl-panel{display:flex;flex-direction:column;gap:8px;padding:10px 12px;font-size:13px;}.schl-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}.schl-panel-title{font-weight:600;color:var(--dsw-alias-label-primary);}.schl-panel-link{color:var(--dsw-alias-brand-primary);text-decoration:none;font-size:12px;}.schl-searchrow{display:flex;gap:8px;}.schl-input{flex:1;min-width:0;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;outline:none;}.schl-input:focus{border-color:var(--dsw-alias-brand-primary);}.schl-btn{padding:6px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px;}.schl-btn:disabled{opacity:.5;cursor:default;}.schl-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);}.schl-results{display:flex;flex-direction:column;gap:10px;}.schl-about{color:var(--dsw-alias-label-secondary);font-size:12px;}.schl-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:4px;}.schl-title{font-weight:600;color:var(--dsw-alias-label-primary);}.schl-title a{color:var(--dsw-alias-brand-primary);text-decoration:none;}.schl-meta{color:var(--dsw-alias-label-secondary);font-size:12px;}.schl-snippet{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45;}.schl-abstract{color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.5;}.schl-actions{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;align-items:center;}.schl-badge{color:var(--dsw-alias-state-success-primary);font-weight:600;}.schl-if{color:var(--dsw-alias-state-warn-primary);font-weight:600;}.schl-link{color:var(--dsw-alias-brand-primary);text-decoration:none;}.schl-path{font-family:monospace;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all;}.schl-running{color:var(--dsw-alias-label-secondary);font-size:12px;}.schl-error{color:var(--dsw-alias-state-error-primary);font-size:12px;}.schl-raw{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:pre-wrap;}')

    function fmtNum(n) {
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    function IfBadge(r) {
      if (!r.impact_factor || r.impact_factor <= 0) return null
      const label = 'IF ' + (r.impact_factor % 1 === 0 ? String(r.impact_factor) : r.impact_factor.toFixed(1)) + (r.jif_quartile ? ' · ' + r.jif_quartile : '')
      return React.createElement('span', { className: 'schl-if' }, label)
    }

    function ResultsList(props) {
      const results = props.results || []
      const about = props.about
      return React.createElement('div', { className: 'schl-results' },
        about ? React.createElement('div', { className: 'schl-about' }, 'About ' + about + ' results') : null,
        results.map(function (r) {
          const metaParts = [r.authors_raw, r.journal_full || r.venue, r.year > 0 ? String(r.year) : '', r.publisher].filter(Boolean)
          return React.createElement('div', { className: 'schl-card', key: 'r' + r.index },
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
        host.call('scholar-export', { query: query, results: results, withDetails: withDetails })
          .then(function (res) {
            setExportResult(res && typeof res === 'object' ? res : { error: 'unexpected export response' })
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
      return React.createElement('div', { className: 'schl-actions' },
        React.createElement('label', { className: 'schl-check' },
          React.createElement('input', { type: 'checkbox', checked: exp.withDetails, onChange: function (e) { exp.setWithDetails(e.target.checked) }, disabled: exp.exporting }),
          'include full details (abstract/DOI/date)'),
        React.createElement('button', { className: 'schl-btn', onClick: function () { exp.doExport(query, results) }, disabled: exp.exporting || !results || !results.length },
          exp.exporting ? 'Exporting…' : 'Export CSV'),
        exp.exportResult ? React.createElement('span', { className: exp.exportResult.error ? 'schl-error' : 'schl-path' },
          exp.exportResult.error ? ('Export failed: ' + exp.exportResult.error) : ('CSV saved: ' + exp.exportResult.path)) : null
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
            React.createElement(ResultsList, { results: meta.results, about: meta.about }),
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
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const exp = useExport({ withDetails: false })
      const run = function () {
        const q = query.trim()
        if (!q || busy) return
        setBusy(true)
        setError('')
        setData(null)
        host.call('scholar-search', { query: q, maxResults: 10 })
          .then(function (res) {
            if (res && typeof res === 'object' && res.error && !(res.results && res.results.length)) {
              setError(res.error)
            } else {
              setData(res)
            }
          })
          .catch(function (e) {
            setError(String((e && e.message) || e))
          })
          .finally(function () { setBusy(false) })
      }
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
            disabled: busy
          }),
          React.createElement('button', { className: 'schl-btn', onClick: run, disabled: busy || !query.trim() },
            busy ? 'Searching…' : 'Search')
        ),
        error ? React.createElement('div', { className: 'schl-error' }, error) : null,
        busy ? React.createElement('div', { className: 'schl-running' }, 'Searching Google Scholar…') : null,
        data ? React.createElement('div', null,
          React.createElement(ResultsList, { results: data.results, about: data.about }),
          React.createElement(ExportRow, { export: exp, query: data.query, results: data.results })) : null
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
}