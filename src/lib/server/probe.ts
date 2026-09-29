import { open } from 'node:fs/promises';

export interface Dimensions {
	width: number;
	height: number;
}

/** Seul le début du fichier est lu : les dimensions vivent dans l'en-tête. */
const HEAD_BYTES = 256 * 1024;

/** Plafond dur sur chaque boucle : un fichier corrompu ne peut pas figer le serveur. */
const MAX_STEPS = 4096;

async function readHead(path: string): Promise<Buffer> {
	const handle = await open(path, 'r');
	try {
		const buffer = Buffer.alloc(HEAD_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
		return buffer.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

function png(b: Buffer): Dimensions | null {
	if (b.length < 24) return null;
	if (b.readUInt32BE(0) !== 0x89504e47) return null;
	// IHDR est toujours le premier chunk : largeur et hauteur à un offset fixe.
	if (b.toString('ascii', 12, 16) !== 'IHDR') return null;
	return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function gif(b: Buffer): Dimensions | null {
	if (b.length < 10 || b.toString('ascii', 0, 3) !== 'GIF') return null;
	return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

function jpeg(b: Buffer): Dimensions | null {
	if (b.length < 4 || b.readUInt16BE(0) !== 0xffd8) return null;
	let offset = 2;
	for (let step = 0; step < MAX_STEPS; step++) {
		if (offset + 4 > b.length) return null;
		if (b[offset] !== 0xff) {
			offset++; // resynchronisation sur les octets de bourrage
			continue;
		}
		const marker = b[offset + 1];
		if (marker === 0xff) {
			offset++;
			continue;
		}
		const length = b.readUInt16BE(offset + 2);
		if (length < 2) return null;
		// SOF0..SOF15 portent la taille de trame ; SOF4/8/12 n'en sont pas.
		const isFrameHeader =
			marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isFrameHeader) {
			if (offset + 9 > b.length) return null;
			return { height: b.readUInt16BE(offset + 5), width: b.readUInt16BE(offset + 7) };
		}
		offset += 2 + length;
	}
	return null;
}

function webp(b: Buffer): Dimensions | null {
	if (b.length < 30) return null;
	if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
	const format = b.toString('ascii', 12, 16);
	if (format === 'VP8X') {
		// Format étendu : la taille du canevas est stockée en (valeur - 1) sur 24 bits.
		return {
			width: (b.readUIntLE(24, 3) & 0xffffff) + 1,
			height: (b.readUIntLE(27, 3) & 0xffffff) + 1
		};
	}
	if (format === 'VP8 ') {
		// Avec perte : les dimensions suivent le code de départ 0x9d012a.
		if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
		return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
	}
	if (format === 'VP8L') {
		if (b[20] !== 0x2f) return null;
		const bits = b.readUInt32LE(21);
		return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	return null;
}

/**
 * AVIF / HEIC : conteneurs ISOBMFF dont les boxes `ispe` portent les dimensions.
 *
 * Un fichier HEIC en contient généralement plusieurs — une par item, vignettes
 * comprises — et la vignette arrive souvent en premier. Résoudre proprement
 * l'item principal demanderait de parcourir `pitm` → `ipma` → `ipco` ; retenir
 * la plus grande dimension est une heuristique bien plus courte qui tombe sur
 * l'image principale avec tous les encodeurs réels.
 */
function isobmff(b: Buffer): Dimensions | null {
	if (b.length < 12 || b.toString('ascii', 4, 8) !== 'ftyp') return null;

	const marker = Buffer.from('ispe', 'ascii');
	let best: Dimensions | null = null;
	let from = 0;

	for (let step = 0; step < MAX_STEPS; step++) {
		const index = b.indexOf(marker, from);
		if (index < 0 || index + 16 > b.length) break;
		from = index + 4;
		// Charge utile ispe : 4 octets version/flags, puis largeur et hauteur en u32.
		const width = b.readUInt32BE(index + 8);
		const height = b.readUInt32BE(index + 12);
		if (width > 0 && height > 0 && width < 100_000 && height < 100_000) {
			if (!best || width * height > best.width * best.height) best = { width, height };
		}
	}
	return best;
}

const PARSERS = [png, gif, jpeg, webp, isobmff];

/**
 * Dimensions d'image au mieux. Renvoie `null` pour tout format non reconnu
 * (dont toutes les vidéos) : l'appelant se rabat alors sur une mesure navigateur.
 */
export async function probeImage(path: string): Promise<Dimensions | null> {
	let head: Buffer;
	try {
		head = await readHead(path);
	} catch {
		return null;
	}
	for (const parse of PARSERS) {
		try {
			const result = parse(head);
			if (result && result.width > 0 && result.height > 0) return result;
		} catch {
			// Un fichier tronqué ou malformé ne donne simplement aucune dimension.
		}
	}
	return null;
}
