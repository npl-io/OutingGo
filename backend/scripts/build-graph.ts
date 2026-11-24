/**
 * Offline graph builder. Run from backend/: npm run build:graph
 * Reads data/roads-osm*.json (Overpass `out geom` output), keeps the largest
 * strongly connected component and writes data/graph.bin.
 * A "heap out of memory" error can be fixed with
 * NODE_OPTIONS=--max-old-space-size=6144
 */
import fs from 'fs';
import path from 'path';
import { buildGraph } from '../src/engine/graph';
import { serializeGraph } from '../src/engine/graphFile';
import { largestComponentSubgraph } from '../src/engine/scc';
import { buildRoadNetwork } from '../src/lib/osmRoads';

const DATA_DIR = path.join(process.cwd(), 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'graph.bin');
const FILE_PREFIX = 'roads-osm';
const FILE_SUFFIX = '.json';
const KEPT_WARNING_PERCENT = 80;
const BYTES_PER_MB = 1024 * 1024;

function readElements(files: string[]): unknown[] {
  const elements: unknown[] = [];
  for (const file of files) {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
    const record =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    const list = record?.['elements'];
    if (record === null || 'remark' in record || !Array.isArray(list) || list.length === 0) {
      throw new Error(`${file}: the download was incomplete (remark present or no elements)`);
    }
    // A loop, not push(...list): spreading a huge array overflows the call stack.
    for (const element of list) elements.push(element);
    console.log(`read ${file}: ${list.length} elements`);
  }
  return elements;
}

function main(): void {
  const started = Date.now();
  if (!fs.existsSync(DATA_DIR)) throw new Error(`data directory not found: ${DATA_DIR}`);
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.startsWith(FILE_PREFIX) && name.endsWith(FILE_SUFFIX))
    .sort();
  if (files.length === 0) {
    throw new Error(`no ${FILE_PREFIX}*${FILE_SUFFIX} files found in ${DATA_DIR}`);
  }

  const elements = readElements(files);
  const network = buildRoadNetwork(elements);
  const full = buildGraph(network.lat, network.lng, network.edges);
  const { graph, keptNodes } = largestComponentSubgraph(full);
  if (graph.nodeCount === 0) throw new Error('the road network has no nodes');

  const keptPercent = (graph.nodeCount / full.nodeCount) * 100;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (let i = 0; i < graph.nodeCount; i += 1) {
    minLat = Math.min(minLat, graph.lat[i]!);
    maxLat = Math.max(maxLat, graph.lat[i]!);
    minLng = Math.min(minLng, graph.lng[i]!);
    maxLng = Math.max(maxLng, graph.lng[i]!);
  }

  const buffer = serializeGraph(graph);
  fs.writeFileSync(OUTPUT_FILE, buffer);

  console.log(`files read: ${files.length} (${files.join(', ')})`);
  console.log(`ways read: ${network.stats.ways}`);
  console.log(`duplicate ways: ${network.stats.duplicateWays}`);
  console.log(`not routable: ${network.stats.notRoutable}`);
  console.log(`malformed: ${network.stats.malformed}`);
  console.log(`before component step: ${full.nodeCount} nodes, ${full.edgeCount} edges`);
  console.log(`after component step: ${graph.nodeCount} nodes, ${graph.edgeCount} edges`);
  console.log(`nodes kept: ${keptPercent.toFixed(2)}% (${keptNodes.length} nodes)`);
  if (keptPercent < KEPT_WARNING_PERCENT) {
    console.warn(
      `WARNING: only ${keptPercent.toFixed(2)}% of nodes kept (below ${KEPT_WARNING_PERCENT}%); the data may be incomplete`,
    );
  }
  console.log(
    `bounding box: lat ${minLat.toFixed(5)}..${maxLat.toFixed(5)}, lng ${minLng.toFixed(5)}..${maxLng.toFixed(5)}`,
  );
  console.log(`wrote ${OUTPUT_FILE}: ${(buffer.length / BYTES_PER_MB).toFixed(2)} MB`);
  console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

try {
  main();
} catch (error) {
  console.error(`build-graph failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
