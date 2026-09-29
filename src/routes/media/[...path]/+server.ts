import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { resolveInsideGenerations } from '$lib/server/scan';
import { kindFor, mimeFor } from '$lib/server/media-types';
import type { RequestHandler } from './$types';

type Range = { start: number; end: number };

/**
 * Analyse un en-tête `bytes=` à plage unique.
 *   null            — absent, malformé ou multi-plage : on sert le fichier entier
 *   'unsatisfiable' — bien formé mais hors du fichier : la RFC 9110 impose un 416
 */
function parseRange(header: string | null, size: number): Range | 'unsatisfiable' | null {
	if (!header) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;

	const [, rawStart, rawEnd] = match;
	let start: number;
	let end: number;

	if (rawStart === '') {
		// Forme suffixe : les N derniers octets.
		const suffix = Number(rawEnd);
		if (!Number.isFinite(suffix)) return null;
		if (suffix <= 0) return 'unsatisfiable';
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = Number(rawStart);
		end = rawEnd === '' ? size - 1 : Number(rawEnd);
	}

	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	if (start > end || start >= size) return 'unsatisfiable';
	return { start, end: Math.min(end, size - 1) };
}

function fileStream(absolute: string, start?: number, end?: number): ReadableStream {
	const node = createReadStream(absolute, start === undefined ? undefined : { start, end });
	return Readable.toWeb(node) as ReadableStream;
}

export const GET: RequestHandler = async ({ params, request, setHeaders }) => {
	const relative = params.path ?? '';
	if (!relative) throw error(404, 'Not found');
	if (!kindFor(relative)) throw error(415, 'Unsupported media type');

	const absolute = resolveInsideGenerations(relative);
	if (!absolute) throw error(403, 'Chemin hors du dossier generations');

	let stats;
	try {
		stats = await stat(absolute);
	} catch {
		throw error(404, `Not found: ${relative}`);
	}
	if (!stats.isFile()) throw error(404, 'Not a file');

	const contentType = mimeFor(relative);
	// Un mur local se recharge sans arrêt ; l'étiquette basée sur le mtime garde
	// cela peu coûteux tout en détectant un fichier régénéré sous le même nom.
	const etag = `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;

	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag, 'accept-ranges': 'bytes' } });
	}

	setHeaders({ 'cache-control': 'no-cache' });

	const range = parseRange(request.headers.get('range'), stats.size);
	if (range === 'unsatisfiable') {
		return new Response(null, {
			status: 416,
			headers: { 'content-range': `bytes */${stats.size}`, 'accept-ranges': 'bytes', etag }
		});
	}
	if (range) {
		const { start, end } = range;
		return new Response(fileStream(absolute, start, end), {
			status: 206,
			headers: {
				'content-type': contentType,
				'content-length': String(end - start + 1),
				'content-range': `bytes ${start}-${end}/${stats.size}`,
				'accept-ranges': 'bytes',
				etag
			}
		});
	}

	return new Response(fileStream(absolute), {
		headers: {
			'content-type': contentType,
			'content-length': String(stats.size),
			'accept-ranges': 'bytes',
			etag
		}
	});
};
