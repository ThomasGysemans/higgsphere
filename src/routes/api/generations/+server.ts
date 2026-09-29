import { rm, stat } from 'node:fs/promises';
import { error, json } from '@sveltejs/kit';
import {
	readGeneration,
	resolveInsideGenerations,
	scanGenerations,
	sidecarCandidates
} from '$lib/server/scan';
import { recordDeletion, syncLedger, type LedgerRollback } from '$lib/server/ledger';
import { kindFor } from '$lib/server/media-types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const index = await scanGenerations();

	// Toute lecture du dossier est l'occasion d'inscrire au journal les
	// générations qui viennent d'apparaître : leur prix est enregistré dès leur
	// arrivée, sans attendre qu'on les supprime.
	const { warnings } = await syncLedger(index);

	return json(
		{ ...index, warnings: [...index.warnings, ...warnings] },
		{ headers: { 'cache-control': 'no-store' } }
	);
};

/**
 * Supprime définitivement un média et le sidecar qui l'accompagne.
 *
 * La suppression est irréversible — le fichier ne passe pas par la corbeille —
 * donc l'interface demande une confirmation explicite avant d'appeler cette route.
 *
 * La **dépense**, elle, survit : le coût, la date et le fournisseur sont archivés
 * dans le journal avant que quoi que ce soit ne soit effacé. Sans cela, effacer
 * un média reviendrait à effacer l'argent qu'il a coûté.
 */
export const DELETE: RequestHandler = async ({ request }) => {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		throw error(400, 'Corps JSON attendu');
	}

	const file = (payload as { file?: unknown })?.file;
	if (typeof file !== 'string' || !file.trim()) {
		throw error(400, 'Champ « file » manquant');
	}
	// Seul un média est supprimable : un sidecar seul n'est jamais une cible.
	if (!kindFor(file)) {
		throw error(400, 'Seuls les médias peuvent être supprimés');
	}

	const absolute = resolveInsideGenerations(file);
	if (!absolute) {
		throw error(403, 'Chemin hors du dossier generations');
	}

	const stats = await stat(absolute).catch(() => null);
	if (!stats?.isFile()) {
		throw error(404, `Introuvable : ${file}`);
	}

	// Archivage d'abord : une dépense doit être inscrite avant que sa preuve
	// ne disparaisse. En cas d'échec d'écriture, on ne supprime rien.
	let rollback: LedgerRollback | null = null;
	const item = await readGeneration(file);
	if (item) {
		try {
			rollback = await recordDeletion(item);
		} catch (cause) {
			throw error(
				500,
				`Suppression annulée : la dépense n'a pas pu être archivée (${(cause as Error).message}). Le fichier est intact.`
			);
		}
	}

	const removed: string[] = [];
	try {
		await rm(absolute);
		removed.push(file);
	} catch (cause) {
		// Le média est toujours là : son coût est encore compté dans le mur, il ne
		// doit donc pas l'être une seconde fois dans le journal.
		await rollback?.();
		throw error(500, `Suppression impossible : ${(cause as Error).message}`);
	}

	// Le sidecar suit le média ; son absence n'est pas une erreur.
	for (const candidate of sidecarCandidates(file)) {
		const sidecarPath = resolveInsideGenerations(candidate);
		if (!sidecarPath) continue;
		try {
			await rm(sidecarPath);
			removed.push(candidate);
		} catch {
			// Pas de sidecar sous ce nom : rien à faire.
		}
	}

	return json({ removed, recorded: item !== null });
};
