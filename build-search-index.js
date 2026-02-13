const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const MiniSearch = require('minisearch');

const MANUAL_DIR = __dirname;
const PAGES_DIR = path.join(MANUAL_DIR, 'pages');
const OUTPUT_DIR = path.join(MANUAL_DIR, 'search-data');
const SHARD_SIZE = 2000;
const BODY_TRUNCATE = 2000;
const SNIPPET_LENGTH = 200;

const TITLE_SUFFIX_RE = /\s*[—–-]\s*2008 Cadillac SRX.*$/;

// Escape non-ASCII characters in a JSON string so .js files are pure ASCII.
// This avoids encoding issues when servers don't declare charset=utf-8 for .js files.
function asciiSafeJSON(obj) {
  return JSON.stringify(obj).replace(/[\u0080-\uffff]/g, ch =>
    '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
  );
}

const PAGE_TYPE_MAP = {
  'Testing and Inspection': 'testing',
  'Service and Repair': 'service',
  'Diagrams': 'diagrams',
  'Locations': 'locations',
  'Technical Service Bulletins': 'tsb',
  'Labor Times': 'labor',
  'Specifications': 'specifications',
  'Diagnostic Trouble Codes': 'dtc',
  'Description and Operation': 'description',
  'Service Precautions': 'precautions',
  'Tools and Equipment': 'tools',
  'Adjustments': 'adjustments',
  'Parts': 'parts',
};

function parsePage(filePath) {
  const html = fs.readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html);

  // Extract title
  const rawTitle = $('title').text();
  const title = rawTitle.replace(TITLE_SUFFIX_RE, '').trim();

  // Extract breadcrumb segments after "SRX AWD V8-4.6L"
  const crumbs = [];
  let foundRoot = false;
  $('a.breadcrumb-part').each((_i, el) => {
    const text = $(el).text().trim();
    if (foundRoot) crumbs.push(text);
    if (text === 'SRX AWD V8-4.6L') foundRoot = true;
  });
  const breadcrumb = crumbs.join(' > ');

  // Extract body text from div.main
  const mainDiv = $('div.main');
  mainDiv.find('h1').remove();
  mainDiv.find('button').remove();
  mainDiv.find('img').remove();

  const bodyText = mainDiv.text()
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, BODY_TRUNCATE);

  const snippet = bodyText.slice(0, SNIPPET_LENGTH);

  // Determine page type from last breadcrumb segment
  const lastCrumb = crumbs[crumbs.length - 1] || '';
  let pageType = PAGE_TYPE_MAP[lastCrumb] || 'content';

  // Detect labor times tables
  if ($('table.labor-times-table').length > 0) pageType = 'labor';
  // Detect TSBs
  if (bodyText.includes('Bulletin No.:') || bodyText.includes('Bulletin No:')) pageType = 'tsb';

  // Detect nav-only pages (pages that only have links to sub-sections)
  const hasExpandButton = $('button#expand-all').length > 0;
  const mainLinks = mainDiv.find('ul > li > a[href]');
  const strippedBodyLen = bodyText.replace(/\s/g, '').length;
  const isNavPage = hasExpandButton && mainLinks.length > 0 && strippedBodyLen < 150;

  if (isNavPage) pageType = 'nav';

  return { title, breadcrumb, bodyText, snippet, pageType, isNavPage };
}

function run() {
  console.log('Scanning pages directory...');
  const files = fs.readdirSync(PAGES_DIR)
    .filter(f => f.endsWith('.html'))
    .sort((a, b) => parseInt(a) - parseInt(b));

  console.log(`Found ${files.length} pages. Parsing...`);

  const allDocs = [];
  let parsed = 0;

  for (const file of files) {
    const pageId = parseInt(path.basename(file, '.html'), 10);
    const filePath = path.join(PAGES_DIR, file);

    try {
      const data = parsePage(filePath);
      allDocs.push({
        id: pageId,
        title: data.title,
        breadcrumb: data.breadcrumb,
        bodyText: data.bodyText,
        snippet: data.snippet,
        pageType: data.pageType,
        isNavPage: data.isNavPage,
      });
    } catch (err) {
      console.warn(`  Warning: failed to parse ${file}: ${err.message}`);
    }

    parsed++;
    if (parsed % 2000 === 0) {
      console.log(`  Parsed ${parsed}/${files.length}...`);
    }
  }

  console.log(`Parsed ${allDocs.length} pages successfully.`);

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // --- Tier 1: Quick Index (title + breadcrumb) ---
  console.log('Building Tier 1 (quick) index...');
  const quickIndex = new MiniSearch({
    fields: ['title', 'breadcrumb'],
    storeFields: [],
    idField: 'id',
  });

  quickIndex.addAll(allDocs.map(d => ({
    id: d.id,
    title: d.title,
    breadcrumb: d.breadcrumb,
  })));

  const quickJSON = asciiSafeJSON(quickIndex.toJSON());
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index-quick.js'),
    'window._searchData = window._searchData || {};\nwindow._searchData.quick = ' + quickJSON + ';\n');
  console.log(`  Tier 1 index: ${(quickJSON.length / 1024 / 1024).toFixed(2)} MB`);

  // --- Page metadata for result display ---
  console.log('Writing page metadata...');
  const pageMeta = allDocs.map(d => ({
    id: d.id,
    title: d.title,
    breadcrumb: d.breadcrumb,
    pageType: d.pageType,
    snippet: d.snippet,
  }));
  const metaJSON = asciiSafeJSON(pageMeta);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'page-meta.js'),
    'window._searchData = window._searchData || {};\nwindow._searchData.meta = ' + metaJSON + ';\n');
  console.log(`  Page metadata: ${(metaJSON.length / 1024 / 1024).toFixed(2)} MB`);

  // --- Tier 2: Full-text sharded indexes ---
  console.log('Building Tier 2 (full-text) sharded indexes...');
  const contentDocs = allDocs.filter(d => !d.isNavPage && d.bodyText.length > 50);
  console.log(`  ${contentDocs.length} content pages (excluded ${allDocs.length - contentDocs.length} nav/empty pages)`);

  const shardCount = Math.ceil(contentDocs.length / SHARD_SIZE);
  const shardRanges = [];

  for (let i = 0; i < shardCount; i++) {
    const start = i * SHARD_SIZE;
    const end = Math.min(start + SHARD_SIZE, contentDocs.length);
    const shardDocs = contentDocs.slice(start, end);

    const shardIndex = new MiniSearch({
      fields: ['body'],
      storeFields: [],
      idField: 'id',
    });

    shardIndex.addAll(shardDocs.map(d => ({
      id: d.id,
      body: d.bodyText,
    })));

    const shardJSON = asciiSafeJSON(shardIndex.toJSON());
    const shardFile = `index-full-${i}.js`;
    fs.writeFileSync(path.join(OUTPUT_DIR, shardFile),
      'window._searchData = window._searchData || {};\n' +
      'window._searchData.shards = window._searchData.shards || {};\n' +
      'window._searchData.shards[' + i + '] = ' + shardJSON + ';\n');

    shardRanges.push({
      file: shardFile,
      firstId: shardDocs[0].id,
      lastId: shardDocs[shardDocs.length - 1].id,
      docCount: shardDocs.length,
    });

    console.log(`  Shard ${i}: ${shardDocs.length} docs, ${(shardJSON.length / 1024 / 1024).toFixed(2)} MB`);
  }

  // --- Manifest ---
  const manifest = {
    shardCount,
    shards: shardRanges,
    totalPages: allDocs.length,
    contentPages: contentDocs.length,
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.js'),
    'window._searchData = window._searchData || {};\nwindow._searchData.manifest = ' +
    asciiSafeJSON(manifest) + ';\n');

  // --- Copy MiniSearch UMD bundle ---
  console.log('Copying MiniSearch library...');
  const srcLib = path.join(MANUAL_DIR, 'node_modules', 'minisearch', 'dist', 'umd', 'index.js');
  const destLib = path.join(OUTPUT_DIR, 'minisearch.min.js');
  fs.copyFileSync(srcLib, destLib);

  // --- Summary ---
  const totalSize = fs.readdirSync(OUTPUT_DIR)
    .reduce((sum, f) => sum + fs.statSync(path.join(OUTPUT_DIR, f)).size, 0);

  console.log('\nBuild complete!');
  console.log(`  Output directory: ${OUTPUT_DIR}`);
  console.log(`  Total index size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Files created: ${fs.readdirSync(OUTPUT_DIR).length}`);
  console.log(`  Tier 1 (quick): index-quick.js`);
  console.log(`  Tier 2 (full-text): ${shardCount} shards`);
  console.log(`  Metadata: page-meta.js`);
  console.log(`  Library: minisearch.min.js`);
}

run();
