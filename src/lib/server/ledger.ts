/**
 * Journal des dépenses — le registre de tout ce qui a été payé.
 *
 * Le coût d'une génération vit dans son sidecar `.json`, qui disparaît avec le
 * média. Ce journal en garde la trace ailleurs : une ligne est écrite **dès que
 * la génération apparaît**, pas seulement quand elle est supprimée. Le mur
 * compte des fichiers, le journal compte des paiements.
 *
 * C'est un **journal d'événements** en ajout seul : `created`, `updated`,
 * `deleted`. L'état courant se reconstruit en repliant les lignes dans l'ordre.
 * Ce détour permet de rester en ajout seul tout en corrigeant un coût renseigné
 * après coup, en suivant un fichier rangé dans un sous-dossier, et en constatant
 * la disparition d'un média effacé hors de l'application.
 *
 * Le fichier commence par un point : `walk()` et le watcher SSE ignorent déjà les
 * fichiers cachés, il n'apparaît donc pas dans le mur et n'y déclenche aucun rescan.
 */

import { appendFile, readFile, stat, truncate } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
	GalleryIndex,
	GenerationItem,
	LedgerEvent,
	LedgerGeneration,
	LedgerPayload
} from '$lib/types';
import { GENERATIONS_DIR } from './scan';

/** Chemin du journal, à la racine du dossier surveillé. */
export const LEDGER_FILE = path.join(GENERATIONS_DIR, '.higgsphere-ledger.jsonl');

/** Garde-fou : un journal pathologique ne doit pas figer le serveur. */
const MAX_EVENTS = 50_000;

/**
 * Champs dont un changement vaut un événement `updated`.
 *
 * Volontairement restreint à ce qui porte de l'argent ou de l'identité : le
 * poids du fichier ou ses dimensions changent au réencodage sans qu'aucune
 * dépense ne bouge, et écrire une ligne à chaque scan ferait enfler le journal
 * pour rien. Les autres champs suivent quand une ligne est écrite.
 */
const TRACKED_FIELDS = [
	'cost',
	'currency',
	'service',
	'model',
	'created_at',
	'duration',
	'name',
	'kind'
] as const;

/** Annule l'écriture d'un événement, si la suppression qui suit a échoué. */
export type LedgerRollback = () => Promise<void>;

function payloadOf(item: GenerationItem): LedgerPayload {
	return {
		file: item.file,
		name: item.name,
		kind: item.kind,
		cost: item.cost,
		currency: item.currency,
		service: item.service,
		model: item.model,
		created_at: new Date(item.createdAt).toISOString(),
		duration: item.duration,
		width: item.width,
		height: item.height,
		bytes: item.bytes,
		prompt: item.prompt || undefined,
		tags: item.tags.length ? item.tags : undefined,
		seed: item.seed ?? undefined,
		notes: item.notes ?? undefined
	};
}

function asStringOrNull(value: unknown): string | null {
	if (typeof value === 'string' && value.trim() !== '') return value.trim();
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return null;
}

function asNumberOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Une ligne du journal, ou `null` si elle est inexploitable. */
function parseEvent(line: string): LedgerEvent | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

	const record = parsed as Record<string, unknown>;
	const file = asStringOrNull(record.file);
	const at = asStringOrNull(record.at) ?? asStringOrNull(record.deleted_at);
	const id = asStringOrNull(record.id);
	if (!file || !at || !id) return null;

	const kind = record.event;
	const event: LedgerEvent['event'] =
		kind === 'created' || kind === 'updated' || kind === 'deleted' ? kind : 'updated';

	return {
		event,
		id,
		at,
		reason: asStringOrNull(record.reason) ?? undefined,
		file,
		name: asStringOrNull(record.name) ?? file.split('/').pop()!,
		kind: record.kind === 'video' ? 'video' : 'image',
		cost: asNumberOrNull(record.cost),
		currency: asStringOrNull(record.currency) ?? 'USD',
		service: asStringOrNull(record.service),
		model: asStringOrNull(record.model),
		created_at: asStringOrNull(record.created_at) ?? at,
		duration: asNumberOrNull(record.duration),
		width: asNumberOrNull(record.width),
		height: asNumberOrNull(record.height),
		bytes: asNumberOrNull(record.bytes) ?? 0,
		prompt: asStringOrNull(record.prompt) ?? undefined,
		tags: Array.isArray(record.tags) ? record.tags.map(String) : undefined,
		seed: asStringOrNull(record.seed) ?? undefined,
		notes: asStringOrNull(record.notes) ?? undefined
	};
}

/**
 * Replie les événements en générations.
 *
 * Tolérant par construction : un `updated` ou un `deleted` sur une identité
 * inconnue ouvre la génération au lieu de partir en erreur. Une seule ligne
 * abîmée ne doit jamais faire disparaître un historique de dépenses.
 */
function fold(events: LedgerEvent[]): LedgerGeneration[] {
	const generations = new Map<string, LedgerGeneration>();

	for (const event of events) {
		const { event: kind, id, at, reason, ...payload } = event;
		const existing = generations.get(id);

		if (!existing) {
			generations.set(id, {
				...payload,
				id,
				deletedAt: kind === 'deleted' ? at : null,
				deletedReason: kind === 'deleted' ? (reason ?? 'app') : null
			});
			continue;
		}

		Object.assign(existing, payload);
		if (kind === 'deleted') {
			existing.deletedAt = at;
			existing.deletedReason = reason ?? 'app';
		}
	}

	return [...generations.values()];
}

/**
 * Relit le journal. Une ligne illisible est ignorée et signalée, jamais fatale.
 */
export async function readLedger(): Promise<{
	generations: LedgerGeneration[];
	warnings: string[];
}> {
	const warnings: string[] = [];
	let raw: string;

	try {
		raw = await readFile(LEDGER_FILE, 'utf8');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		// Pas encore de journal : aucune génération n'a encore été enregistrée.
		if (code === 'ENOENT') return { generations: [], warnings };
		warnings.push(`Unreadable spend ledger: ${(error as Error).message}`);
		return { generations: [], warnings };
	}

	const lines = raw.split('\n').filter((line) => line.trim() !== '');
	if (lines.length > MAX_EVENTS) {
		const dropped = lines.length - MAX_EVENTS;
		lines.splice(0, dropped);
		warnings.push(`Spend ledger truncated: ${dropped} oldest events ignored`);
	}

	const events: LedgerEvent[] = [];
	let broken = 0;
	for (const line of lines) {
		const event = parseEvent(line);
		if (event) events.push(event);
		else broken += 1;
	}
	if (broken) warnings.push(`Spend ledger: ${broken} unreadable line(s) ignored`);

	return { generations: fold(events), warnings };
}

/** Ajoute des lignes au journal, en une seule écriture. */
async function append(events: LedgerEvent[]): Promise<LedgerRollback> {
	const before = await stat(LEDGER_FILE).catch(() => null);
	const offset = before?.isFile() ? before.size : 0;

	// JSON.stringify échappe les sauts de ligne : un événement tient toujours sur
	// une seule ligne, même avec un prompt multi-lignes.
	const body = events.map((event) => `${JSON.stringify(event)}\n`).join('');
	await appendFile(LEDGER_FILE, body, 'utf8');

	return async () => {
		await truncate(LEDGER_FILE, offset).catch(() => {
			// Rien de mieux à faire : le journal reste lisible, avec une ligne en trop.
		});
	};
}

function changed(generation: LedgerGeneration, payload: LedgerPayload): boolean {
	if (generation.file !== payload.file) return true;
	return TRACKED_FIELDS.some((field) => generation[field] !== payload[field]);
}

/**
 * Les scans concurrents sont la règle (SSE + polling + deux onglets) : sans
 * sérialisation, deux d'entre eux pourraient enregistrer deux fois la même
 * génération. Chaque synchronisation attend la précédente.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Met le journal à jour à partir d'un scan du dossier, puis renvoie l'état replié.
 *
 * Trois écritures possibles :
 * - `created` — une génération inconnue est apparue dans `generations/` ;
 * - `updated` — son coût, son fournisseur ou son chemin ont changé (typiquement
 *   le sidecar écrit une seconde après le média, ou un prix corrigé à la main) ;
 * - `deleted` avec `reason: "missing"` — le média a disparu du disque sans passer
 *   par l'application (un `rm` dans le terminal).
 *
 * Un fichier simplement déplacé n'est pas une nouvelle dépense : il est reconnu
 * à son nom et à sa taille, et donne un `updated` de chemin, pas un couple
 * suppression + création qui compterait l'argent deux fois.
 */
export function syncLedger(index: GalleryIndex): Promise<{
	generations: LedgerGeneration[];
	warnings: string[];
}> {
	const run = queue.then(
		() => syncNow(index),
		() => syncNow(index)
	);
	queue = run.catch(() => {});
	return run;
}

async function syncNow(index: GalleryIndex): Promise<{
	generations: LedgerGeneration[];
	warnings: string[];
}> {
	const { generations, warnings } = await readLedger();

	const open = generations.filter((generation) => generation.deletedAt === null);
	const openByFile = new Map(open.map((generation) => [generation.file, generation]));
	const liveByFile = new Map(index.items.map((item) => [item.file, item]));

	const now = new Date().toISOString();
	const events: LedgerEvent[] = [];

	// Générations connues dont le fichier n'est plus là où il était.
	const vanished = open.filter((generation) => !liveByFile.has(generation.file));
	// Médias présents que le journal ne connaît pas encore.
	const unknown = index.items.filter((item) => !openByFile.has(item.file));

	/**
	 * Un média disparu d'un côté et apparu de l'autre avec le même nom et le même
	 * poids est le même fichier, rangé ailleurs. `generations/` encourage les
	 * sous-dossiers : un `mv` ne doit pas doubler la dépense.
	 */
	const moved = new Map<string, LedgerGeneration>();
	for (const generation of vanished) {
		const match = unknown.find(
			(item) =>
				!moved.has(item.file) && item.name === generation.name && item.bytes === generation.bytes
		);
		if (match) moved.set(match.file, generation);
	}

	for (const item of index.items) {
		const generation = openByFile.get(item.file) ?? moved.get(item.file);
		const payload = payloadOf(item);

		if (!generation) {
			events.push({ event: 'created', id: randomUUID(), at: now, ...payload });
		} else if (changed(generation, payload)) {
			events.push({ event: 'updated', id: generation.id, at: now, ...payload });
		}
	}

	/**
	 * La détection des disparitions n'est tentée que sur un scan complet : un
	 * dossier momentanément illisible produit un index partiel, et enterrer
	 * l'historique sur cette base serait pire que de rater un `rm`.
	 */
	const trustworthy = index.warnings.length === 0;
	if (trustworthy) {
		const relocated = new Set([...moved.values()].map((generation) => generation.id));
		for (const generation of vanished) {
			if (relocated.has(generation.id)) continue;
			const { id, deletedAt, deletedReason, ...payload } = generation;
			events.push({ event: 'deleted', id, at: now, reason: 'missing', ...payload });
		}
	}

	if (!events.length) return { generations, warnings };

	try {
		await append(events);
	} catch (error) {
		warnings.push(`Spend ledger not updated: ${(error as Error).message}`);
		return { generations, warnings };
	}

	// Replié à nouveau plutôt que rafistolé : une seule définition de l'état courant.
	const reread = await readLedger();
	return { generations: reread.generations, warnings: [...warnings, ...reread.warnings] };
}

/**
 * Enregistre la suppression d'un média depuis l'application.
 *
 * L'événement porte l'état **final** du sidecar, lu juste avant l'effacement :
 * c'est la dernière occasion de fixer le prix. Renvoie un retour arrière, car
 * l'écriture précède la suppression — si celle-ci échoue, le média reste visible
 * dans le mur et ne doit pas être compté une seconde fois comme supprimé.
 */
export async function recordDeletion(item: GenerationItem): Promise<LedgerRollback> {
	const { generations } = await readLedger();
	const open = generations.find(
		(generation) => generation.deletedAt === null && generation.file === item.file
	);

	return append([
		{
			event: 'deleted',
			// Génération jamais enregistrée (journal illisible, ou média déposé et
			// supprimé entre deux scans) : elle naît et meurt dans le même événement.
			id: open?.id ?? randomUUID(),
			at: new Date().toISOString(),
			reason: 'app',
			...payloadOf(item)
		}
	]);
}
