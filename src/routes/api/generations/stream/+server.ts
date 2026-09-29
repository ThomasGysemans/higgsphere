import { watch, type FSWatcher } from 'node:fs';
import { existsSync } from 'node:fs';
import { GENERATIONS_DIR } from '$lib/server/scan';
import { kindFor, extensionOf } from '$lib/server/media-types';
import type { RequestHandler } from './$types';

/** Les événements fichier arrivent en rafale (write, chmod, rename) : on les fusionne. */
const DEBOUNCE_MS = 300;
/** Empêche la connexion d'être coupée pendant que le dossier reste inactif. */
const HEARTBEAT_MS = 25_000;
/** Fréquence de recherche du dossier tant qu'il n'existe pas encore. */
const EXISTENCE_POLL_MS = 3_000;

/**
 * Server-sent events : émet `change` dès qu'un média ou un sidecar apparaît,
 * est modifié ou supprimé. Le client réagit en rechargeant l'index.
 */
export const GET: RequestHandler = async ({ request }) => {
	const encoder = new TextEncoder();

	let watcher: FSWatcher | null = null;
	let debounce: ReturnType<typeof setTimeout> | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let existencePoll: ReturnType<typeof setInterval> | null = null;
	let closed = false;

	const stream = new ReadableStream({
		start(controller) {
			const emit = (event: string, data: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					cleanup();
				}
			};

			const notifyChange = (reason: string) => {
				if (debounce) clearTimeout(debounce);
				debounce = setTimeout(() => emit('change', { reason, at: Date.now() }), DEBOUNCE_MS);
			};

			const startWatching = () => {
				if (watcher || !existsSync(GENERATIONS_DIR)) return false;
				try {
					watcher = watch(GENERATIONS_DIR, { recursive: true }, (_event, filename) => {
						const name = filename?.toString() ?? '';
						// Ignore les fichiers temporaires d'éditeur et tout ce qui n'est ni média ni métadonnée.
						const base = name.split(/[/\\]/).pop() ?? '';
						if (base.startsWith('.')) return;
						if (name && !kindFor(name) && extensionOf(name) !== 'json') return;
						notifyChange(name || 'directory');
					});
					watcher.on('error', () => {
						watcher?.close();
						watcher = null;
					});
					return true;
				} catch {
					watcher = null;
					return false;
				}
			};

			function cleanup() {
				if (closed) return;
				closed = true;
				if (debounce) clearTimeout(debounce);
				if (heartbeat) clearInterval(heartbeat);
				if (existencePoll) clearInterval(existencePoll);
				watcher?.close();
				watcher = null;
				try {
					controller.close();
				} catch {
					// Déjà fermé par la déconnexion du client.
				}
			}

			request.signal.addEventListener('abort', cleanup);

			const watching = startWatching();
			emit('ready', { root: GENERATIONS_DIR, watching });

			if (!watching) {
				// Le dossier peut être créé plus tard : on le prend dès son apparition.
				existencePoll = setInterval(() => {
					if (startWatching()) {
						clearInterval(existencePoll!);
						existencePoll = null;
						notifyChange('folder-created');
					}
				}, EXISTENCE_POLL_MS);
			}

			heartbeat = setInterval(() => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					cleanup();
				}
			}, HEARTBEAT_MS);
		},
		cancel() {
			closed = true;
			if (debounce) clearTimeout(debounce);
			if (heartbeat) clearInterval(heartbeat);
			if (existencePoll) clearInterval(existencePoll);
			watcher?.close();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-store',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
