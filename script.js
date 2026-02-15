/* ============================================================
   OPERATION CHARM — Script.js
   Handles: tree collapse/expand, search bar, sidebar nav,
            sibling tabs, autocomplete, recently viewed
   ============================================================ */

// ---- ORIGINAL COLLAPSE/EXPAND FUNCTIONALITY ----

const allCollapsibleUls = document.querySelectorAll('ul ul');
let foldingStateChanged = false;

function isCollapsibleUl(elt) {
    return [].indexOf.call(allCollapsibleUls, elt) !== -1;
}

function findHashA() {
    const hash = location.hash.slice(1);
    if (hash.length === 0) return null;
    const nameFirefox = hash.split("/").map(decodeURIComponent).join("/");
    const nameChrome = hash;
    const eltsFF = document.getElementsByName(nameFirefox);
    const eltsChrome = document.getElementsByName(nameChrome);
    if (eltsFF.length > 0) return eltsFF[0];
    if (eltsChrome.length > 0) return eltsChrome[0];
}

function toLi(elt) {
    while (elt.tagName !== 'LI') elt = elt.parentElement;
    return elt;
}

function aToUl(aElt) { return toLi(aElt).querySelector('ul'); }
function ulToA(ulElt) { return toLi(ulElt).querySelector('a'); }

function parentUl(ulElt) {
    let curElt = ulElt.parentElement;
    while (curElt !== document.body && !isCollapsibleUl(curElt)) curElt = curElt.parentElement;
    return isCollapsibleUl(curElt) && curElt;
}

function updateFolderIcon(ulElt) {
    const li = toLi(ulElt);
    if (isUlShown(ulElt)) li.classList.add('li-folder-open');
    else li.classList.remove('li-folder-open');
}

function hideUl(ulElt) {
    foldingStateChanged = true;
    ulElt.classList.add("hidden");
    updateFolderIcon(ulElt);
}

function showUl(ulElt) {
    foldingStateChanged = true;
    ulElt.classList.remove('hidden');
    updateFolderIcon(ulElt);
}

function toggleUl(ulElt) {
    foldingStateChanged = true;
    ulElt.classList.toggle('hidden');
    updateFolderIcon(ulElt);
}

function isUlShown(ulElt) { return !ulElt.classList.contains('hidden'); }

function linkClickedHandler(event) { toggleUl(aToUl(event.target)); }

function setupLink(ulElt) {
    const elt = ulToA(ulElt);
    if (elt.tagName === "A" && !elt.href) {
        elt.href = "javascript:void(0)";
        elt.addEventListener("click", linkClickedHandler);
    }
}

function hideAll() { [].forEach.call(allCollapsibleUls, hideUl); }
function showAll() { [].forEach.call(allCollapsibleUls, showUl); }

function normalizedPath() {
    const hasTrailingSlash = location.pathname.slice(-1) === '/';
    return location.pathname.slice(1) + (hasTrailingSlash ? '' : '/');
}

function isFoldablePage() {
    const numCarPathParts = 3;
    const maxUnfoldedLis = 20;
    return normalizedPath().slice(0, -1).split('/').length > numCarPathParts
        && document.getElementsByTagName('li').length > maxUnfoldedLis;
}

function saveState() {
    const foldingState = foldingStateChanged
        ? [].map.call(allCollapsibleUls, isUlShown).map(c => c ? '1' : '0').join('')
        : null;
    const state = { lastHash: location.hash, folding: foldingState, scrollY: window.scrollY };
    sessionStorage.setItem(normalizedPath(), JSON.stringify(state));
}

function restoreState() {
    const stateStr = sessionStorage.getItem(normalizedPath());
    if (stateStr) {
        const state = JSON.parse(stateStr);
        if (state.folding) {
            state.folding.split('').forEach((ch, i) => {
                if (ch === '1') showUl(allCollapsibleUls[i]);
                else if (ch === '0') hideUl(allCollapsibleUls[i]);
                else { sessionStorage.removeItem(normalizedPath()); }
            });
        }
        state.alreadySeenHash = location.hash === state.lastHash;
        if (state.alreadySeenHash) window.scroll(window.scrollX, state.scrollY);
        return state;
    }
    return false;
}

function collapseExpandMain() {
    if (!isFoldablePage()) {
        if (document.getElementById('expand-all')) {
            document.getElementById('expand-all').classList.add('hidden');
            document.getElementById('collapse-all').classList.add('hidden');
        }
        [].forEach.call(allCollapsibleUls, elt => toLi(elt).classList.add('li-folder-open'));
        return;
    }

    [].forEach.call(allCollapsibleUls, setupLink);
    window.addEventListener('beforeunload', saveState);
    if (document.getElementById("expand-all")) {
        document.getElementById("expand-all").addEventListener("click", showAll);
        document.getElementById("collapse-all").addEventListener("click", hideAll);
    }

    const restoredState = restoreState();
    if (!(restoredState && restoredState.folding)) hideAll();

    const hashA = findHashA();
    if (hashA) {
        const hashUl = aToUl(hashA);
        let hashUlParent = hashUl;
        while (hashUlParent) {
            showUl(hashUlParent);
            hashUlParent = parentUl(hashUlParent);
        }
        toLi(hashA).classList.add("selected");
        if (!restoredState.alreadySeenHash) {
            hashA.scrollIntoView();
            window.scrollY -= 50;
        }
    }

    foldingStateChanged = false;
}

collapseExpandMain();

// ---- HUB PAGE CARD LAYOUT DETECTION ----
// Only apply card-style grid on simple hub pages (few direct children, no deep nesting)
(function detectHubCards() {
    var expandBtn = document.getElementById('expand-all');
    if (!expandBtn) return;

    var mainUl = document.querySelector('.main > ul');
    if (!mainUl) return;

    var directChildren = mainUl.children.length;
    // Only card-ify if ≤20 direct children (simple hub like "Alarm Module" with 4 items)
    // Pages like "Repair and Diagnosis" with 31+ top-level categories should stay as a tree
    if (directChildren <= 20) {
        document.body.classList.add('hub-cards');
    }
})();


// ============================================================
// UTILITY — Detect page context
// ============================================================

var CHARM = {};

(function() {
    // Detect if we're inside /pages/
    var pathParts = location.pathname.replace(/\\/g, '/').split('/');
    var fileName = pathParts[pathParts.length - 1] || '';
    var parentDir = pathParts[pathParts.length - 2] || '';

    CHARM.isInPages = parentDir === 'pages';
    CHARM.pageId = CHARM.isInPages ? parseInt(fileName.replace('.html', ''), 10) : null;
    CHARM.basePath = CHARM.isInPages ? '../' : '';

    // Extract breadcrumb text from the page
    var crumbs = document.querySelectorAll('.breadcrumb-part');
    CHARM.breadcrumbTexts = [];
    var foundRoot = false;
    for (var i = 0; i < crumbs.length; i++) {
        var t = crumbs[i].textContent.trim();
        if (foundRoot) CHARM.breadcrumbTexts.push(t);
        if (t === 'SRX AWD V8-4.6L') foundRoot = true;
    }
})();


// ============================================================
// SEARCH BAR INJECTION
// ============================================================

(function injectSearchBar() {
    var header = document.querySelector('.header');
    if (!header) return;

    var container = document.createElement('div');
    container.className = 'search-bar-inline';
    container.innerHTML =
        '<form class="search-form-inline">' +
        '<input type="text" id="search-input-inline" placeholder="Search manual..." autocomplete="off">' +
        '<button type="submit">Search</button>' +
        '</form>';
    header.appendChild(container);

    var searchPage = CHARM.isInPages ? '../search.html' : 'search.html';

    container.querySelector('form').addEventListener('submit', function(e) {
        e.preventDefault();
        var q = document.getElementById('search-input-inline').value.trim();
        if (q) window.location.href = searchPage + '?q=' + encodeURIComponent(q);
    });
})();


// ============================================================
// AUTOCOMPLETE
// ============================================================

(function initAutocomplete() {
    var input = document.getElementById('search-input-inline');
    if (!input) return;

    var container = input.closest('.search-bar-inline');
    var dropdown = null;
    var items = [];
    var activeIdx = -1;
    var acData = null;
    var acLoading = false;
    var acLoaded = false;

    function loadAutocompleteData() {
        if (acLoaded || acLoading) return;
        acLoading = true;
        var script = document.createElement('script');
        script.src = CHARM.basePath + 'search-data/autocomplete.js';
        script.onload = function() {
            if (window._searchData && window._searchData.autocomplete) {
                acData = window._searchData.autocomplete;
                acLoaded = true;
            }
            acLoading = false;
        };
        script.onerror = function() { acLoading = false; };
        document.head.appendChild(script);
    }

    function createDropdown() {
        if (dropdown) return;
        dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';
        dropdown.style.display = 'none';
        container.appendChild(dropdown);
    }

    function hideDropdown() {
        if (dropdown) dropdown.style.display = 'none';
        activeIdx = -1;
        items = [];
    }

    function showResults(query) {
        if (!acData || query.length < 2) { hideDropdown(); return; }
        createDropdown();

        var q = query.toLowerCase();
        var matches = [];
        var exact = [];
        var startsWith = [];
        var contains = [];

        for (var i = 0; i < acData.length && matches.length < 50; i++) {
            var entry = acData[i];
            var titleLower = entry.t.toLowerCase();
            if (titleLower === q) {
                exact.push(entry);
            } else if (titleLower.indexOf(q) === 0) {
                startsWith.push(entry);
            } else if (titleLower.indexOf(q) !== -1) {
                contains.push(entry);
            } else if (entry.b && entry.b.toLowerCase().indexOf(q) !== -1) {
                contains.push(entry);
            }
        }

        matches = exact.concat(startsWith).concat(contains).slice(0, 8);

        if (matches.length === 0) { hideDropdown(); return; }

        var html = '';
        for (var j = 0; j < matches.length; j++) {
            var m = matches[j];
            var href = CHARM.basePath + 'pages/' + m.i + '.html';
            // Abbreviate breadcrumb (last 2 parts)
            var breadParts = m.b ? m.b.split(' > ') : [];
            var shortBread = breadParts.slice(-2).join(' > ');

            html += '<a class="autocomplete-item" href="' + href + '" data-idx="' + j + '">' +
                '<div class="autocomplete-title">' + escapeHtml(m.t) +
                '<span class="autocomplete-type-badge" data-type="' + m.p + '">' + m.p + '</span>' +
                '</div>' +
                (shortBread ? '<div class="autocomplete-breadcrumb">' + escapeHtml(shortBread) + '</div>' : '') +
                '</a>';
        }

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
        items = dropdown.querySelectorAll('.autocomplete-item');
        activeIdx = -1;
    }

    function setActive(idx) {
        for (var i = 0; i < items.length; i++) {
            items[i].classList.remove('active');
        }
        activeIdx = idx;
        if (idx >= 0 && idx < items.length) {
            items[idx].classList.add('active');
        }
    }

    // Load data on focus
    input.addEventListener('focus', loadAutocompleteData);

    // Filter on input
    input.addEventListener('input', function() {
        showResults(this.value.trim());
    });

    // Keyboard navigation
    input.addEventListener('keydown', function(e) {
        if (!dropdown || dropdown.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(Math.min(activeIdx + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(Math.max(activeIdx - 1, -1));
        } else if (e.key === 'Enter') {
            if (activeIdx >= 0 && activeIdx < items.length) {
                e.preventDefault();
                window.location.href = items[activeIdx].href;
            }
            // If no selection, let the form submit handler take over
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    });

    // Hide on outside click
    document.addEventListener('click', function(e) {
        if (!container.contains(e.target)) hideDropdown();
    });
})();


// ============================================================
// SIBLING SECTION TABS
// ============================================================

(function initSiblingTabs() {
    if (!CHARM.isInPages || CHARM.pageId === null) return;

    // Load siblings data
    var script = document.createElement('script');
    script.src = CHARM.basePath + 'search-data/siblings.js';
    script.onload = function() {
        var sibData = window._searchData && window._searchData.siblings;
        if (!sibData) return;

        var groupIdx = sibData.m[CHARM.pageId];
        if (groupIdx === undefined) return;

        var siblings = sibData.g[groupIdx];
        if (!siblings || siblings.length <= 1) return;

        // Build tab bar
        var tabBar = document.createElement('div');
        tabBar.className = 'sibling-tabs';

        for (var i = 0; i < siblings.length; i++) {
            var sib = siblings[i]; // [id, name, pageType]
            var tab = document.createElement('a');
            tab.className = 'sibling-tab';
            tab.setAttribute('data-type', sib[2]);
            tab.textContent = sib[1];

            if (sib[0] === CHARM.pageId) {
                tab.classList.add('active');
                tab.href = 'javascript:void(0)';
            } else {
                tab.href = sib[0] + '.html';
            }

            tabBar.appendChild(tab);
        }

        // Insert before the h1
        var mainDiv = document.querySelector('.main');
        var h1 = mainDiv && mainDiv.querySelector('h1');
        if (h1 && h1.nextSibling) {
            mainDiv.insertBefore(tabBar, h1.nextSibling);
        } else if (mainDiv) {
            mainDiv.appendChild(tabBar);
        }
    };
    document.head.appendChild(script);
})();


// ============================================================
// SIDEBAR NAVIGATION
// ============================================================

(function initSidebar() {
    if (!CHARM.isInPages || CHARM.pageId === null) return;

    // Create sidebar elements
    var sidebar = document.createElement('nav');
    sidebar.className = 'sidebar-nav';
    sidebar.id = 'sidebar-nav';

    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'sidebar-toggle';
    toggleBtn.id = 'sidebar-toggle';
    toggleBtn.innerHTML = '&#9776;'; // hamburger
    toggleBtn.title = 'Toggle navigation';

    document.body.appendChild(sidebar);
    document.body.appendChild(toggleBtn);

    // Restore sidebar state
    var sidebarOpen = localStorage.getItem('charm-sidebar') !== 'closed';

    function setSidebarState(open) {
        sidebarOpen = open;
        sidebar.classList.toggle('open', open);
        document.body.classList.toggle('sidebar-open', open);
        toggleBtn.innerHTML = open ? '&#10005;' : '&#9776;'; // X or hamburger
        localStorage.setItem('charm-sidebar', open ? 'open' : 'closed');
    }

    toggleBtn.addEventListener('click', function() {
        setSidebarState(!sidebarOpen);
    });

    // Close sidebar when clicking overlay on mobile
    document.addEventListener('click', function(e) {
        if (sidebarOpen && e.target === document.body && window.innerWidth <= 900) {
            // Check if click is on the overlay (pseudo-element area)
        }
    });

    // Load nav tree and render sidebar
    var script = document.createElement('script');
    script.src = CHARM.basePath + 'search-data/nav-tree.js';
    script.onload = function() {
        var navTree = window._searchData && window._searchData.navTree;
        if (!navTree) return;

        renderSidebar(navTree);
        setSidebarState(sidebarOpen);
    };
    document.head.appendChild(script);

    function renderSidebar(tree) {
        var html = '<div class="sidebar-tree">';
        html += renderBranch(tree, 0);
        html += '</div>';

        // Add recently viewed section
        html += renderRecentlyViewed();

        sidebar.innerHTML = html;

        // Bind folder toggle clicks
        var toggles = sidebar.querySelectorAll('.sidebar-folder-toggle');
        for (var i = 0; i < toggles.length; i++) {
            toggles[i].addEventListener('click', handleFolderToggle);
        }

        // Scroll current item into view
        var currentLink = sidebar.querySelector('.current');
        if (currentLink) {
            setTimeout(function() {
                currentLink.scrollIntoView({ block: 'center', behavior: 'auto' });
            }, 100);
        }
    }

    function renderBranch(nodes, depth) {
        var html = '<ul>';
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i]; // [name, id, pageType, children]
            var name = node[0];
            var id = node[1];
            var pageType = node[2];
            var children = node[3];
            var hasChildren = children && children.length > 0;

            // Check if this node is on the path to the current page
            var isOnPath = isAncestorOf(node, CHARM.pageId);
            var isCurrent = id === CHARM.pageId;

            html += '<li>';

            if (hasChildren) {
                var expanded = isOnPath || depth < 1;
                html += '<div class="sidebar-folder-toggle' + (expanded ? ' expanded' : '') + '">' +
                    '<span class="arrow">&#9654;</span>' +
                    (id ? '<a href="' + id + '.html"' + (isCurrent ? ' class="current"' : '') + '>' + escapeHtml(name) + '</a>' : escapeHtml(name)) +
                    '</div>';
                html += '<ul' + (expanded ? '' : ' style="display:none"') + '>';
                html += renderBranch(children, depth + 1);
                html += '</ul>';
            } else {
                html += '<a href="' + (id ? id + '.html' : '#') + '"' +
                    (isCurrent ? ' class="current"' : '') + '>' +
                    escapeHtml(name) + '</a>';
            }

            html += '</li>';
        }
        html += '</ul>';
        return html;
    }

    // Check if a tree node contains the target page id
    function isAncestorOf(node, targetId) {
        if (node[1] === targetId) return true;
        var children = node[3];
        if (!children) return false;
        for (var i = 0; i < children.length; i++) {
            if (isAncestorOf(children[i], targetId)) return true;
        }
        return false;
    }

    function handleFolderToggle(e) {
        var toggle = e.currentTarget;
        var sublist = toggle.nextElementSibling;
        if (!sublist || sublist.tagName !== 'UL') return;

        var isExpanded = toggle.classList.contains('expanded');
        toggle.classList.toggle('expanded');
        sublist.style.display = isExpanded ? 'none' : '';
    }
})();


// ============================================================
// RECENTLY VIEWED
// ============================================================

var RECENT_KEY = 'charm-recent';
var MAX_RECENT = 10;

function getRecentlyViewed() {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch (e) {
        return [];
    }
}

function trackRecentPage() {
    if (!CHARM.isInPages || CHARM.pageId === null) return;

    var title = document.querySelector('.main h1');
    var titleText = title ? title.textContent.trim() : ('Page ' + CHARM.pageId);

    // Get shortened breadcrumb
    var shortBread = CHARM.breadcrumbTexts.slice(-2).join(' > ');

    var recent = getRecentlyViewed();

    // Remove existing entry for this page
    recent = recent.filter(function(r) { return r.i !== CHARM.pageId; });

    // Add to front
    recent.unshift({
        i: CHARM.pageId,
        t: titleText,
        b: shortBread
    });

    // Cap at MAX_RECENT
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);

    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

function renderRecentlyViewed() {
    var recent = getRecentlyViewed();
    if (recent.length === 0) return '';

    var html = '<div class="sidebar-section-title">Recently Viewed</div>';
    html += '<div class="sidebar-tree"><ul>';

    for (var i = 0; i < recent.length; i++) {
        var r = recent[i];
        var isCurrent = r.i === CHARM.pageId;
        html += '<li><a href="' + r.i + '.html"' + (isCurrent ? ' class="current"' : '') + '>' +
            escapeHtml(r.t) + '</a></li>';
    }

    html += '</ul></div>';
    return html;
}

trackRecentPage();


// ============================================================
// UTILITY
// ============================================================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
