(function () {
  'use strict';

  var quickIndex = null;
  var fullShards = [];
  var pageMeta = null;
  var manifest = null;
  var fullTextLoaded = false;

  var RESULTS_PER_PAGE = 25;
  var SEARCH_DATA = 'search-data/';

  // ── Synonym dictionary: common car-owner terms → GM service manual terms ──
  // Each key is a phrase (or single word) the user might type.
  // The value is an array of additional search terms to inject.
  // Multi-word keys are checked first (longest match wins).
  var SYNONYMS_PHRASE = {
    'check engine light':   ['MIL', 'malfunction indicator lamp'],
    'check engine':         ['MIL', 'malfunction indicator lamp'],
    'engine light':         ['MIL', 'malfunction indicator lamp'],
    'serpentine belt':      ['drive belt', 'accessory drive belt'],
    'accessory belt':       ['drive belt', 'accessory drive belt'],
    'fan belt':             ['drive belt'],
    'fuse box':             ['fuse block'],
    'fusebox':              ['fuse block'],
    'torque specs':         ['tightening torques', 'fastener tightening specifications'],
    'torque specifications': ['tightening torques', 'fastener tightening specifications'],
    'torque spec':          ['tightening torques', 'fastener tightening specifications'],
    'bolt torque':          ['tightening torques', 'fastener tightening specifications'],
    'oil change':           ['engine oil', 'oil change reminder'],
    'tranny':               ['transmission', 'transaxle'],
    'trans fluid':          ['transmission fluid'],
    'tranny fluid':         ['transmission fluid'],
    'o2 sensor':            ['oxygen sensor', 'heated oxygen sensor'],
    'oxygen sensor':        ['heated oxygen sensor'],
    'cat converter':        ['catalytic converter'],
    'catalytic':            ['catalytic converter'],
    'power window':         ['window regulator', 'window motor'],
    'window motor':         ['window regulator'],
    'ac':                   ['air conditioning', 'A/C', 'HVAC'],
    'a/c':                  ['air conditioning', 'HVAC'],
    'air conditioning':     ['A/C', 'HVAC'],
    'heater core':          ['heater', 'HVAC'],
    'abs light':            ['ABS indicator', 'anti-lock brake'],
    'abs':                  ['anti-lock brake', 'electronic brake control'],
    'anti lock':            ['ABS', 'electronic brake control'],
    'turn signal':          ['directional signal', 'turn signal lamp'],
    'blinker':              ['turn signal', 'directional signal'],
    'parking brake':        ['park brake'],
    'e brake':              ['park brake', 'parking brake'],
    'emergency brake':      ['park brake', 'parking brake'],
    'gas tank':             ['fuel tank'],
    'gas pump':             ['fuel pump'],
    'gas filter':           ['fuel filter'],
    'muffler':              ['exhaust system', 'exhaust muffler'],
    'tail pipe':            ['exhaust system', 'exhaust tail pipe'],
    'header':               ['exhaust manifold'],
    'headers':              ['exhaust manifold'],
    'lug nut':              ['wheel nut', 'wheel stud'],
    'hub bearing':          ['wheel bearing', 'wheel hub'],
    'wheel hub':            ['wheel bearing'],
    'cv joint':             ['drive shaft', 'constant velocity'],
    'cv axle':              ['drive shaft', 'front drive axle'],
    'tie rod':              ['tie rod end', 'steering linkage'],
    'ball joint':           ['ball stud', 'ball joint'],
    'control arm':          ['suspension arm', 'control arm'],
    'sway bar':             ['stabilizer shaft', 'stabilizer bar'],
    'stabilizer':           ['stabilizer shaft', 'stabilizer bar'],
    'shock absorber':       ['shock absorber', 'suspension strut'],
    'struts':               ['suspension strut', 'shock absorber'],
    'coil pack':            ['ignition coil module'],
    'ignition coil':        ['ignition coil module'],
    'plug wire':            ['spark plug wire', 'ignition coil'],
    'timing belt':          ['timing chain', 'timing components'],
    'head gasket':          ['cylinder head gasket'],
    'valve cover':          ['camshaft cover'],
    'valve cover gasket':   ['camshaft cover seal', 'camshaft cover gasket'],
    'pcv valve':            ['positive crankcase ventilation', 'PCV'],
    'map sensor':           ['manifold absolute pressure'],
    'maf sensor':           ['mass air flow'],
    'mass air flow':        ['mass air flow sensor', 'MAF'],
    'tps':                  ['throttle position sensor'],
    'iac':                  ['idle air control'],
    'egr':                  ['exhaust gas recirculation'],
    'evap':                 ['evaporative emission'],
    'coolant temp sensor':  ['engine coolant temperature sensor', 'ECT'],
    'water pump':           ['water pump', 'coolant pump'],
    'thermostat housing':   ['thermostat', 'thermostat housing'],
    'freeze plug':          ['core plug', 'expansion plug'],
    'dome light':           ['courtesy lamp', 'interior lamp'],
    'interior light':       ['courtesy lamp', 'interior lamp'],
    'tail light':           ['tail lamp'],
    'brake light':          ['stop lamp', 'brake lamp'],
    'headlight':            ['headlamp'],
    'headlamp':             ['headlamp assembly', 'headlamp bulb'],
    'fog light':            ['fog lamp'],
    'running light':        ['daytime running lamp'],
    'key fob':              ['keyless entry', 'remote control'],
    'remote start':         ['remote start', 'keyless entry'],
    'door lock actuator':   ['door lock actuator', 'door lock motor'],
    'blend door':           ['air door actuator', 'HVAC actuator'],
    'blower motor':         ['blower motor', 'HVAC blower'],
    'cabin filter':         ['cabin air filter', 'air filter'],
    'air filter':           ['air cleaner', 'air filter element'],
  };

  // Build sorted phrase list (longest first for greedy matching)
  var SYNONYM_PHRASES_SORTED = Object.keys(SYNONYMS_PHRASE)
    .sort(function (a, b) { return b.length - a.length; });

  // ── Page type priority for deduplication ──
  // Lower = more useful to a person doing repairs (shown first)
  var TYPE_PRIORITY = {
    service: 1,
    testing: 2,
    diagrams: 3,
    description: 4,
    tsb: 5,
    specifications: 6,
    locations: 7,
    dtc: 8,
    precautions: 9,
    tools: 10,
    adjustments: 11,
    labor: 12,
    parts: 13,
    content: 14,
    nav: 20,
  };

  var TYPE_ICONS = {
    testing: 'icons/testing-and-inspection.svg',
    service: 'icons/service-and-repair.svg',
    diagrams: 'icons/diagrams.svg',
    locations: 'icons/locations.svg',
    tsb: 'icons/technical-service-bulletins.svg',
    labor: 'icons/labor-times.svg',
    specifications: 'icons/specifications.svg',
    dtc: 'icons/diagnostic-trouble-codes.svg',
    description: 'icons/description-and-operation.svg',
    precautions: 'icons/service-precautions.svg',
    tools: 'icons/tools-and-equipment.svg',
    adjustments: 'icons/adjustments.svg',
    parts: 'icons/parts.svg',
  };

  var TYPE_LABELS = {
    testing: 'Testing',
    service: 'Service & Repair',
    diagrams: 'Diagram',
    locations: 'Location',
    tsb: 'TSB',
    labor: 'Labor Times',
    specifications: 'Specs',
    dtc: 'DTC',
    description: 'Description',
    precautions: 'Precaution',
    tools: 'Tools',
    adjustments: 'Adjustment',
    parts: 'Parts',
    nav: 'Index',
    content: 'Content',
  };

  // ── Synonym expansion ──
  // Takes the user's raw query, finds matching synonym phrases, and returns
  // an expanded query string with additional GM terms appended.
  // Uses word-boundary matching to avoid false positives like "ac" in "replacement".
  function expandQuery(query) {
    var lower = ' ' + query.toLowerCase().trim() + ' ';
    var extra = [];

    for (var i = 0; i < SYNONYM_PHRASES_SORTED.length; i++) {
      var phrase = SYNONYM_PHRASES_SORTED[i];
      // Build a regex with word boundaries
      var re = new RegExp('(?:^|[\\s/\\-])'  + escapeRegex(phrase) + '(?:$|[\\s/\\-])', 'i');
      if (re.test(lower)) {
        var synonyms = SYNONYMS_PHRASE[phrase];
        for (var j = 0; j < synonyms.length; j++) {
          extra.push(synonyms[j]);
        }
        // Remove matched phrase from lower so we don't double-match substrings
        lower = lower.replace(new RegExp(escapeRegex(phrase), 'i'), ' ');
      }
    }

    if (extra.length > 0) {
      return query + ' ' + extra.join(' ');
    }
    return query;
  }

  // ── Deduplication ──
  // Groups results by title, keeps the one from the best section (Repair > Parts & Labor),
  // and for identical-title results within the same top section, keeps the best page type.
  function deduplicateResults(results) {
    // Group by title
    var groups = {};
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var meta = pageMeta.get(r.id) || {};
      var title = (meta.title || '').toLowerCase();
      var bc = meta.breadcrumb || '';
      var pageType = meta.pageType || 'content';

      // Create a dedup key: title + the system path (excluding Repair vs Parts top-level)
      // This way "Thermostat" under Repair and "Thermostat" under Parts are grouped,
      // but "Thermostat" and "Thermostat Gasket" are not.
      var key = title;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push({
        result: r,
        meta: meta,
        pageType: pageType,
        isRepair: bc.indexOf('Repair and Diagnosis') === 0,
        priority: TYPE_PRIORITY[pageType] || 15,
        score: r.score,
      });
    }

    // Pick the best from each group
    var deduped = [];
    var keys = Object.keys(groups);
    for (var k = 0; k < keys.length; k++) {
      var group = groups[keys[k]];

      // Sort: prefer Repair over Parts, then by type priority, then by score
      group.sort(function (a, b) {
        // Prefer Repair and Diagnosis section
        if (a.isRepair !== b.isRepair) return a.isRepair ? -1 : 1;
        // Then by type priority
        if (a.priority !== b.priority) return a.priority - b.priority;
        // Then by search score
        return b.score - a.score;
      });

      var best = group[0];
      // Carry forward the highest score from any duplicate
      var maxScore = best.score;
      for (var g = 1; g < group.length; g++) {
        if (group[g].score > maxScore) maxScore = group[g].score;
      }
      best.result.score = maxScore;
      best.result._dedupCount = group.length;
      deduped.push(best.result);
    }

    // Re-sort by score
    deduped.sort(function (a, b) { return b.score - a.score; });
    return deduped;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function setStatus(msg) {
    var el = document.getElementById('search-status');
    if (el) el.textContent = msg;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightTerms(text, query) {
    if (!text) return '';
    var escaped = escapeHtml(text);
    // Highlight both original query terms and expanded synonym terms
    var terms = query.toLowerCase().split(/\s+/).filter(function (t) { return t.length > 1; });
    // Deduplicate
    var seen = {};
    var unique = [];
    for (var i = 0; i < terms.length; i++) {
      if (!seen[terms[i]]) { seen[terms[i]] = true; unique.push(terms[i]); }
    }
    var result = escaped;
    for (var j = 0; j < unique.length; j++) {
      var regex = new RegExp('(' + escapeRegex(unique[j]) + '\\w*)', 'gi');
      result = result.replace(regex, '<mark>$1</mark>');
    }
    return result + (text.length >= 200 ? '...' : '');
  }

  function renderResult(result, query) {
    var meta = pageMeta.get(result.id) || {};
    var title = meta.title || result.title || 'Page ' + result.id;
    var breadcrumb = meta.breadcrumb || result.breadcrumb || '';
    var pageType = meta.pageType || result.pageType || 'content';
    var snippet = meta.snippet || result.snippet || '';
    var pageUrl = 'pages/' + result.id + '.html';
    var iconSrc = TYPE_ICONS[pageType] || '';
    var typeLabel = TYPE_LABELS[pageType] || '';

    var iconHtml = iconSrc
      ? '<img class="result-type-icon" src="' + iconSrc + '" alt="">'
      : '';
    var badgeHtml = typeLabel
      ? '<span class="result-type-badge">' + typeLabel + '</span>'
      : '';

    return '<div class="search-result">' +
      '<div class="result-title">' + iconHtml +
      '<a href="' + pageUrl + '">' + escapeHtml(title) + '</a>' +
      badgeHtml + '</div>' +
      '<div class="result-breadcrumb">' + escapeHtml(breadcrumb) + '</div>' +
      '<div class="result-snippet">' + highlightTerms(snippet, query) + '</div>' +
      '</div>';
  }

  function displayResults(results, query) {
    var resultsDiv = document.getElementById('search-results');

    if (results.length === 0) {
      resultsDiv.innerHTML = '<div class="no-results">No results found for "' +
        escapeHtml(query) + '"</div>';
      return;
    }

    var displayCount = Math.min(results.length, RESULTS_PER_PAGE);
    var html = '<div class="search-result-count">' + results.length +
      ' result' + (results.length !== 1 ? 's' : '') + ' found</div>';

    for (var i = 0; i < displayCount; i++) {
      html += renderResult(results[i], query);
    }

    if (results.length > RESULTS_PER_PAGE) {
      html += '<button class="load-more-btn" id="load-more">Show more results (' +
        (results.length - RESULTS_PER_PAGE) + ' remaining)</button>';
    }

    resultsDiv.innerHTML = html;
    resultsDiv._allResults = results;
    resultsDiv._query = query;
    resultsDiv._offset = RESULTS_PER_PAGE;

    var btn = document.getElementById('load-more');
    if (btn) btn.addEventListener('click', loadMore);
  }

  function loadMore() {
    var resultsDiv = document.getElementById('search-results');
    var results = resultsDiv._allResults;
    var query = resultsDiv._query;
    var offset = resultsDiv._offset;
    var end = Math.min(offset + RESULTS_PER_PAGE, results.length);

    var btn = document.getElementById('load-more');
    if (btn) btn.remove();

    var fragment = '';
    for (var i = offset; i < end; i++) {
      fragment += renderResult(results[i], query);
    }

    resultsDiv._offset = end;

    if (end < results.length) {
      fragment += '<button class="load-more-btn" id="load-more">Show more results (' +
        (results.length - end) + ' remaining)</button>';
    }

    resultsDiv.insertAdjacentHTML('beforeend', fragment);

    var newBtn = document.getElementById('load-more');
    if (newBtn) newBtn.addEventListener('click', loadMore);
  }

  function loadFullTextShards() {
    if (fullTextLoaded) return Promise.resolve();

    setStatus('Loading full-text index...');

    var promises = [];
    for (var i = 0; i < manifest.shardCount; i++) {
      promises.push(loadScript(SEARCH_DATA + 'index-full-' + i + '.js'));
    }

    return Promise.all(promises).then(function () {
      var shardData = window._searchData.shards || {};
      fullShards = [];
      for (var i = 0; i < manifest.shardCount; i++) {
        if (shardData[i]) {
          fullShards.push(MiniSearch.loadJSON(JSON.stringify(shardData[i]), {
            fields: ['body'],
            storeFields: [],
            idField: 'id',
          }));
        }
      }
      fullTextLoaded = true;
      setStatus('Full-text index loaded');
    }).catch(function (err) {
      setStatus('Error loading full-text index: ' + err.message);
      console.error(err);
    });
  }

  // ── Core search with synonym expansion, AND logic, smart fuzzy, and dedup ──
  function performSearch(query) {
    if (!query.trim() || !quickIndex) return;

    var resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '<div class="search-loading">Searching...</div>';

    // Step 1: Expand synonyms
    var expanded = expandQuery(query);

    // Step 2: Search with AND for multi-word queries, OR for single-word
    var terms = query.trim().split(/\s+/);
    var isSingleWord = terms.length === 1;

    // Smart fuzzy: only for terms >= 5 chars, lower tolerance
    var searchOpts = {
      prefix: true,
      fuzzy: function (term) {
        if (term.length < 5) return false;  // No fuzzy for short terms
        if (term.length < 7) return 1;      // Max 1 edit for medium terms
        return 2;                            // Max 2 edits for long terms
      },
      boost: { title: 5, breadcrumb: 1 },
      combineWith: isSingleWord ? 'OR' : 'AND',
    };

    // Search with original query (AND mode for multi-word)
    var results = quickIndex.search(query, searchOpts);

    // Also search with expanded query (OR mode to pick up synonym matches)
    if (expanded !== query) {
      var expandedResults = quickIndex.search(expanded, {
        prefix: true,
        fuzzy: false,
        boost: { title: 5, breadcrumb: 1 },
        combineWith: 'OR',
      });

      // Merge: boost results that match both original AND synonyms
      var resultMap = new Map();
      for (var i = 0; i < results.length; i++) {
        resultMap.set(results[i].id, results[i]);
      }
      for (var j = 0; j < expandedResults.length; j++) {
        var r = expandedResults[j];
        var existing = resultMap.get(r.id);
        if (existing) {
          existing.score += r.score * 0.3; // Boost already-found results
        } else {
          r.score *= 0.5; // Synonym-only matches rank lower
          resultMap.set(r.id, r);
        }
      }
      results = Array.from(resultMap.values())
        .sort(function (a, b) { return b.score - a.score; });
    }

    // Step 3: If few results and user wants full-text, or checkbox checked
    var wantFullText = document.getElementById('search-fulltext').checked;

    if (wantFullText || results.length < 5) {
      loadFullTextShards().then(function () {
        if (!fullTextLoaded) {
          var deduped = deduplicateResults(results);
          displayResults(deduped, expanded);
          return;
        }

        var ftOpts = {
          prefix: true,
          fuzzy: function (term) {
            if (term.length < 5) return false;
            if (term.length < 7) return 1;
            return 2;
          },
          combineWith: isSingleWord ? 'OR' : 'AND',
        };

        var resultMap = new Map();
        for (var i = 0; i < results.length; i++) {
          resultMap.set(results[i].id, results[i]);
        }

        // Search full-text with both original and expanded
        var ftQueries = [query];
        if (expanded !== query) ftQueries.push(expanded);

        for (var q = 0; q < ftQueries.length; q++) {
          for (var s = 0; s < fullShards.length; s++) {
            var shardResults = fullShards[s].search(ftQueries[q], ftOpts);
            for (var k = 0; k < shardResults.length; k++) {
              var sr = shardResults[k];
              var ex = resultMap.get(sr.id);
              if (!ex) {
                sr.score *= (q === 0 ? 0.4 : 0.2); // Full-text ranks lower, synonym-expanded even lower
                resultMap.set(sr.id, sr);
              } else {
                ex.score += sr.score * 0.2;
              }
            }
          }
        }

        var merged = Array.from(resultMap.values())
          .sort(function (a, b) { return b.score - a.score; });

        var deduped = deduplicateResults(merged);
        displayResults(deduped, expanded);
        setStatus(deduped.length + ' results');
      });
    } else {
      var deduped = deduplicateResults(results);
      displayResults(deduped, expanded);
      setStatus(deduped.length + ' results');
    }
  }

  function init() {
    var sd = window._searchData;

    if (!sd || !sd.quick || !sd.meta || !sd.manifest) {
      setStatus('Error: search data not loaded. Check that search-data/*.js files exist.');
      return;
    }

    setStatus('Initializing...');

    quickIndex = MiniSearch.loadJSON(JSON.stringify(sd.quick), {
      fields: ['title', 'breadcrumb'],
      storeFields: [],
      idField: 'id',
    });

    pageMeta = new Map();
    for (var i = 0; i < sd.meta.length; i++) {
      pageMeta.set(sd.meta[i].id, sd.meta[i]);
    }

    manifest = sd.manifest;
    setStatus('Ready — ' + manifest.totalPages + ' pages indexed');

    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q) {
      document.getElementById('search-input').value = q;
      performSearch(q);
    }

    document.getElementById('search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = document.getElementById('search-input').value.trim();
      if (q) {
        try {
          var newUrl = window.location.pathname + '?q=' + encodeURIComponent(q);
          window.history.replaceState(null, '', newUrl);
        } catch (e) { /* replaceState may fail on file:// */ }
        performSearch(q);
      }
    });

    var debounceTimer;
    document.getElementById('search-input').addEventListener('input', function (e) {
      clearTimeout(debounceTimer);
      var q = e.target.value.trim();
      if (q.length >= 3) {
        debounceTimer = setTimeout(function () { performSearch(q); }, 300);
      }
    });
  }

  init();
})();
