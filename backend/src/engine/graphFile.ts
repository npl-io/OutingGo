import os from 'os';
import { EngineError } from './errors';
import type { Graph } from './graph';

const MAGIC = 'OGRF';
const VERSION = 1;
const HEADER_BYTES = 16;
const ALIGNMENT = 8;

interface Layout {
  offsetsStart: number;
  targetsStart: number;
  weightsStart: number;
  latStart: number;
  lngStart: number;
  totalBytes: number;
}

function layoutFor(nodeCount: number, edgeCount: number): Layout {
  const offsetsStart = HEADER_BYTES;
  const targetsStart = offsetsStart + (nodeCount + 1) * 4;
  const weightsStart = targetsStart + edgeCount * 4;
  const weightsEnd = weightsStart + edgeCount * 4;
  const latStart = Math.ceil(weightsEnd / ALIGNMENT) * ALIGNMENT;
  const lngStart = latStart + nodeCount * 8;
  return {
    offsetsStart,
    targetsStart,
    weightsStart,
    latStart,
    lngStart,
    totalBytes: lngStart + nodeCount * 8,
  };
}

function copyIn(target: Buffer, position: number, source: ArrayBufferView): void {
  Buffer.from(source.buffer, source.byteOffset, source.byteLength).copy(target, position);
}

/**
 * Serializes a graph into the OGRF binary format (little-endian): a 16-byte
 * header (magic, version, nodeCount, edgeCount), then offsets, targets,
 * weights, padding to 8 bytes, lat and lng.
 * @throws Error when the host is not little-endian.
 */
export function serializeGraph(graph: Graph): Buffer {
  if (os.endianness() !== 'LE') {
    throw new Error('serializeGraph: only little-endian hosts are supported');
  }
  const layout = layoutFor(graph.nodeCount, graph.edgeCount);
  const buffer = Buffer.alloc(layout.totalBytes);
  buffer.write(MAGIC, 0, 'ascii');
  buffer.writeUInt32LE(VERSION, 4);
  buffer.writeUInt32LE(graph.nodeCount, 8);
  buffer.writeUInt32LE(graph.edgeCount, 12);
  copyIn(buffer, layout.offsetsStart, graph.offsets);
  copyIn(buffer, layout.targetsStart, graph.targets);
  copyIn(buffer, layout.weightsStart, graph.weights);
  copyIn(buffer, layout.latStart, graph.lat);
  copyIn(buffer, layout.lngStart, graph.lng);
  return buffer;
}

function invalid(message: string): EngineError {
  return new EngineError('INVALID_GRAPH_FILE', message);
}

/** Copies a byte range into a fresh, aligned typed array (never a view of the input). */
function copyOut<T extends Uint32Array | Float32Array | Float64Array>(
  buffer: Buffer,
  start: number,
  create: (length: number) => T,
  length: number,
): T {
  const out = create(length);
  new Uint8Array(out.buffer, out.byteOffset, out.byteLength).set(
    buffer.subarray(start, start + out.byteLength),
  );
  return out;
}

/**
 * Parses and validates an OGRF buffer. The returned typed arrays are
 * independent copies.
 * @throws EngineError('INVALID_GRAPH_FILE') when the buffer is not a valid graph file.
 */
export function deserializeGraph(buffer: Buffer): Graph {
  if (buffer.length < HEADER_BYTES) throw invalid('file is shorter than the 16-byte header');
  if (buffer.toString('ascii', 0, 4) !== MAGIC) throw invalid('wrong magic bytes');
  const version = buffer.readUInt32LE(4);
  if (version !== VERSION) throw invalid(`unsupported version ${version}`);

  const nodeCount = buffer.readUInt32LE(8);
  const edgeCount = buffer.readUInt32LE(12);
  const layout = layoutFor(nodeCount, edgeCount);
  if (buffer.length !== layout.totalBytes) {
    throw invalid(`file size ${buffer.length} does not match expected ${layout.totalBytes}`);
  }

  const offsets = copyOut(buffer, layout.offsetsStart, (l) => new Uint32Array(l), nodeCount + 1);
  const targets = copyOut(buffer, layout.targetsStart, (l) => new Uint32Array(l), edgeCount);
  const weights = copyOut(buffer, layout.weightsStart, (l) => new Float32Array(l), edgeCount);
  const lat = copyOut(buffer, layout.latStart, (l) => new Float64Array(l), nodeCount);
  const lng = copyOut(buffer, layout.lngStart, (l) => new Float64Array(l), nodeCount);

  if (offsets[0] !== 0) throw invalid('offsets[0] must be 0');
  for (let i = 0; i < nodeCount; i += 1) {
    if (offsets[i + 1]! < offsets[i]!) throw invalid(`offsets decrease at node ${i}`);
  }
  if (offsets[nodeCount] !== edgeCount) throw invalid('offsets[n] must equal the edge count');
  for (let e = 0; e < edgeCount; e += 1) {
    if (targets[e]! >= nodeCount) throw invalid(`edge ${e} has a target outside the graph`);
    const w = weights[e]!;
    if (!Number.isFinite(w) || w < 0) throw invalid(`edge ${e} has an invalid weight`);
  }
  for (let v = 0; v < nodeCount; v += 1) {
    if (!Number.isFinite(lat[v]!) || !Number.isFinite(lng[v]!)) {
      throw invalid(`node ${v} has a non-finite coordinate`);
    }
  }

  return { nodeCount, edgeCount, offsets, targets, weights, lat, lng };
}
