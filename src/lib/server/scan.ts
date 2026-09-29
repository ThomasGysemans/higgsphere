import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { GalleryFacets, GalleryIndex, GenerationItem, GenerationMeta } from '$lib/types';
import { ASSUMED_CURRENCY } from '$lib/currency';
import { extensionOf, kindFor } from './media-types';
import { probeImage } from './probe';

/** Chemin absolu du dossier surveillé. Surchargeable via GENERATIONS_DIR. */
export const GENERATIONS_DIR = path.resolve(
	process.env.GENERATIONS_DIR ?? path.join(process.cwd(), 'generations')
);

/** Garde-fou contre une arborescence pathologique qui bloquerait le serveur. */
const MAX_DEPTH = 8;

/**
 * Résout un chemin relatif à l'intérieur de `generations/`.
 * Renvoie `null` si le chemin s'échappe du dossier : c'est l'invariant de
 * sécurité partagé par le service de fichiers et la suppression.
 */
export function resolveInsideGenerations(relative: string): string | null {
	if (!relative) return null;
	const absolute = path.resolve(GENERATIONS_DIR, relative);
	const root = GENERATIONS_DIR.endsWith(path.sep) ? GENERATIONS_DIR : GENERATIONS_DIR + path.sep;
	if (absolute !== GENERATIONS_DIR && !absolute.startsWith(root)) return null;
	return absolute;
}

/**
 * Le sondage relit les en-têtes : les résultats sont mémoïsés par
 * (chemin, mtime, taille). Un fichier réécrit obtient une nouvelle clé et est
 * donc sondé à nouveau.
 */
const probeCache = new Map<string, { width: number; height: number } | null>();

interface MediaFile {
	relative: string;
	absolute: string;
	bytes: number;
	mtimeMs: number;
}

interface WalkResult {
	media: MediaFile[];
	jsonFiles: Set<string>;
	warnings: string[];
}

async function walk(dir: string, relative: string, depth: number, out: WalkResult): Promise<void> {
	if (depth > MAX_DEPTH) return;
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		out.warnings.push(`Unreadable folder ${relative || '.'}: ${(error as Error).message}`);
		return;
	}

	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue;
		const absolute = path.join(dir, entry.name);
		const rel = relative ? `${relative}/${entry.name}` : entry.name;

		if (entry.isDirectory()) {
			await walk(absolute, rel, depth + 1, out);
			continue;
		}
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const ext = extensionOf(entry.name);
		if (ext === 'json') {
			out.jsonFiles.add(rel);
			continue;
		}
		if (!kindFor(entry.name)) continue;

		try {
			const stats = await stat(absolute);
			if (!stats.isFile()) continue;
			out.media.push({ relative: rel, absolute, bytes: stats.size, mtimeMs: stats.mtimeMs });
		} catch {
			// Le fichier a disparu entre le readdir et le stat : on l'ignore.
		}
	}
}

/**
 * Un média peut être décrit par `<nom>.json` (extension remplacée) ou par
 * `<nom.ext>.json` (extension ajoutée). Les deux conventions sont acceptées.
 */
export function sidecarCandidates(relative: string): string[] {
	const dot = relative.lastIndexOf('.');
	const withoutExt = dot < 0 ? relative : relative.slice(0, dot);
	return [`${withoutExt}.json`, `${relative}.json`];
}

function toMediaUrl(relative: string): string {
	return `/media/${relative.split('/').map(encodeURIComponent).join('/')}`;
}

function asNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value.replace(/[$€£\s]/g, ''));
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function asString(value: unknown): string | null {
	if (typeof value === 'string' && value.trim() !== '') return value.trim();
	if (typeof value === 'number') return String(value);
	return null;
}

function asTags(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
	if (typeof value === 'string') {
		return value
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean);
	}
	return [];
}

/** Lit le premier alias présent : les sidecars réels sont inconsistants. */
function pick(meta: GenerationMeta, ...keys: string[]): unknown {
	for (const key of keys) {
		if (meta[key] !== undefined && meta[key] !== null && meta[key] !== '') return meta[key];
	}
	return undefined;
}

async function probeDimensions(file: MediaFile): Promise<{ width: number; height: number } | null> {
	const key = `${file.absolute}:${file.mtimeMs}:${file.bytes}`;
	const cached = probeCache.get(key);
	if (cached !== undefined) return cached;
	const result = await probeImage(file.absolute);
	if (probeCache.size > 5000) probeCache.clear();
	probeCache.set(key, result);
	return result;
}

async function buildItem(
	file: MediaFile,
	jsonFiles: Set<string>,
	warnings: string[]
): Promise<GenerationItem> {
	const kind = kindFor(file.relative)!;
	const name = file.relative.split('/').pop()!;

	let meta: GenerationMeta = {};
	let sidecar: string | null = null;
	let metaError: string | null = null;

	for (const candidate of sidecarCandidates(file.relative)) {
		if (!jsonFiles.has(candidate)) continue;
		sidecar = candidate;
		try {
			const raw = await readFile(path.join(GENERATIONS_DIR, candidate), 'utf8');
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				meta = parsed as GenerationMeta;
			} else {
				metaError = 'Sidecar JSON must be an object';
			}
		} catch (error) {
			metaError = (error as Error).message;
			warnings.push(`Invalid metadata in ${candidate}: ${metaError}`);
		}
		break;
	}

	let width = asNumber(pick(meta, 'width', 'w'));
	let height = asNumber(pick(meta, 'height', 'h'));

	// Les sidecars portent souvent "1024x1024" au lieu de champs séparés.
	const size = asString(pick(meta, 'size', 'resolution', 'dimensions'));
	if ((!width || !height) && size) {
		const match = size.match(/(\d+)\s*[x×]\s*(\d+)/i);
		if (match) {
			width = Number(match[1]);
			height = Number(match[2]);
		}
	}
	if ((!width || !height) && kind === 'image') {
		const probed = await probeDimensions(file);
		if (probed) {
			width = probed.width;
			height = probed.height;
		}
	}

	const createdRaw = asString(pick(meta, 'created_at', 'createdAt', 'date', 'timestamp'));
	const createdParsed = createdRaw ? Date.parse(createdRaw) : Number.NaN;
	const createdAt = Number.isNaN(createdParsed) ? file.mtimeMs : createdParsed;

	const poster = asString(pick(meta, 'poster', 'thumbnail', 'thumb'));
	const posterUrl = poster
		? toMediaUrl(poster.includes('/') ? poster : path.posix.join(path.posix.dirname(file.relative), poster))
		: null;

	return {
		id: file.relative,
		file: file.relative,
		url: toMediaUrl(file.relative),
		name,
		kind,
		ext: extensionOf(name),
		bytes: file.bytes,
		createdAt,
		width: width ?? null,
		height: height ?? null,
		aspect: width && height ? width / height : null,
		duration: asNumber(pick(meta, 'duration', 'duration_seconds', 'length')),
		cost: asNumber(pick(meta, 'cost', 'estimated_cost', 'price')),
		currency: asString(pick(meta, 'currency')) ?? ASSUMED_CURRENCY,
		model: asString(pick(meta, 'model', 'model_name')),
		service: asString(pick(meta, 'service', 'provider', 'platform')),
		prompt: asString(pick(meta, 'prompt', 'description', 'text')) ?? '',
		tags: asTags(pick(meta, 'tags', 'labels')),
		seed: asString(pick(meta, 'seed')),
		notes: asString(pick(meta, 'notes', 'note', 'comment')),
		posterUrl,
		sidecar,
		metaError,
		meta
	};
}

function buildFacets(items: GenerationItem[]): GalleryFacets {
	const models = new Set<string>();
	const services = new Set<string>();
	const tags = new Set<string>();
	const kinds = new Set<'image' | 'video'>();
	let totalBytes = 0;

	for (const item of items) {
		if (item.model) models.add(item.model);
		if (item.service) services.add(item.service);
		for (const tag of item.tags) tags.add(tag);
		kinds.add(item.kind);
		totalBytes += item.bytes;
	}

	const alpha = (a: string, b: string) => a.localeCompare(b);
	return {
		models: [...models].sort(alpha),
		services: [...services].sort(alpha),
		tags: [...tags].sort(alpha),
		kinds: [...kinds].sort(),
		totalBytes
	};
}

/** Parcourt `generations/` et renvoie l'index complet, plus récent d'abord. */
export async function scanGenerations(): Promise<GalleryIndex> {
	const scannedAt = Date.now();

	if (!existsSync(GENERATIONS_DIR)) {
		return {
			items: [],
			facets: buildFacets([]),
			root: GENERATIONS_DIR,
			scannedAt,
			warnings: [`Folder not found: ${GENERATIONS_DIR}`]
		};
	}

	const out: WalkResult = { media: [], jsonFiles: new Set(), warnings: [] };
	await walk(GENERATIONS_DIR, '', 0, out);

	const items = await Promise.all(
		out.media.map((file) => buildItem(file, out.jsonFiles, out.warnings))
	);
	// Plus récent d'abord ; le nom de fichier départage pour un ordre stable.
	items.sort((a, b) => b.createdAt - a.createdAt || a.file.localeCompare(b.file));

	return {
		items,
		facets: buildFacets(items),
		root: GENERATIONS_DIR,
		scannedAt,
		warnings: out.warnings
	};
}

/**
 * Construit l'entrée d'un seul média, sans parcourir tout le dossier.
 *
 * Sert à la suppression : il faut la dépense complète (coût, devise, service,
 * date) juste avant d'effacer le fichier, et un scan complet serait du gaspillage.
 * La normalisation reste celle de `buildItem`, pour que l'archive et le mur
 * n'interprètent jamais un sidecar différemment.
 */
export async function readGeneration(relative: string): Promise<GenerationItem | null> {
	const absolute = resolveInsideGenerations(relative);
	if (!absolute || !kindFor(relative)) return null;

	const stats = await stat(absolute).catch(() => null);
	if (!stats?.isFile()) return null;

	const jsonFiles = new Set(
		sidecarCandidates(relative).filter((candidate) => {
			const candidatePath = resolveInsideGenerations(candidate);
			return candidatePath ? existsSync(candidatePath) : false;
		})
	);

	return buildItem(
		{ relative, absolute, bytes: stats.size, mtimeMs: stats.mtimeMs },
		jsonFiles,
		[]
	);
}
