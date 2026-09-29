export const IMAGE_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'webp',
	'gif',
	'avif',
	'bmp',
	'heic',
	'heif'
]);

export const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv']);

const MIME_BY_EXTENSION: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	avif: 'image/avif',
	bmp: 'image/bmp',
	heic: 'image/heic',
	heif: 'image/heif',
	mp4: 'video/mp4',
	m4v: 'video/mp4',
	webm: 'video/webm',
	mov: 'video/quicktime',
	ogv: 'video/ogg',
	mkv: 'video/x-matroska'
};

export function extensionOf(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function mimeFor(name: string): string {
	return MIME_BY_EXTENSION[extensionOf(name)] ?? 'application/octet-stream';
}

export function kindFor(name: string): 'image' | 'video' | null {
	const ext = extensionOf(name);
	if (IMAGE_EXTENSIONS.has(ext)) return 'image';
	if (VIDEO_EXTENSIONS.has(ext)) return 'video';
	return null;
}
