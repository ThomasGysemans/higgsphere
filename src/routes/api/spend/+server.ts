import { json } from '@sveltejs/kit';
import { scanGenerations } from '$lib/server/scan';
import { LEDGER_FILE, syncLedger } from '$lib/server/ledger';
import type { GenerationItem, LedgerGeneration, SpendEntry } from '$lib/types';
import type { RequestHandler } from './$types';

/**
 * Une génération dont le média est encore là.
 *
 * Le sidecar prime sur le journal tant que le fichier existe : c'est la donnée
 * que l'on peut corriger à la main, et le journal n'est là que pour prendre le
 * relais quand elle disparaît.
 */
function fromItem(item: GenerationItem, id: string): SpendEntry {
	return {
		id,
		file: item.file,
		name: item.name,
		kind: item.kind,
		cost: item.cost,
		currency: item.currency,
		service: item.service,
		model: item.model,
		createdAt: item.createdAt,
		deletedAt: null,
		duration: item.duration,
		bytes: item.bytes,
		prompt: item.prompt,
		tags: item.tags,
		url: item.url
	};
}

/** Une génération dont le média n'existe plus : le journal est tout ce qu'il reste. */
function fromLedger(generation: LedgerGeneration): SpendEntry {
	const created = Date.parse(generation.created_at);
	const deleted = generation.deletedAt ? Date.parse(generation.deletedAt) : Number.NaN;
	return {
		id: generation.id,
		file: generation.file,
		name: generation.name,
		kind: generation.kind,
		cost: generation.cost,
		currency: generation.currency,
		service: generation.service,
		model: generation.model,
		createdAt: Number.isNaN(created) ? deleted : created,
		deletedAt: Number.isNaN(deleted) ? Date.now() : deleted,
		duration: generation.duration,
		bytes: generation.bytes,
		prompt: generation.prompt ?? '',
		tags: generation.tags ?? [],
		url: null
	};
}

/**
 * Index des dépenses : tout ce qui a été payé, que le fichier existe encore ou non.
 *
 * Le journal est la colonne vertébrale — il connaît chaque génération depuis son
 * apparition — et les sidecars encore présents viennent rafraîchir celles dont le
 * média n'a pas bougé.
 */
export const GET: RequestHandler = async () => {
	const index = await scanGenerations();
	const { generations, warnings } = await syncLedger(index);

	const liveByFile = new Map(index.items.map((item) => [item.file, item]));
	const covered = new Set<string>();

	const entries: SpendEntry[] = generations.map((generation) => {
		const live = generation.deletedAt === null ? liveByFile.get(generation.file) : undefined;
		if (!live) return fromLedger(generation);
		covered.add(live.file);
		return fromItem(live, generation.id);
	});

	// Filet : si le journal n'a pas pu être écrit, le mur ne doit pas pour autant
	// disparaître de la page des dépenses.
	for (const item of index.items) {
		if (!covered.has(item.file)) entries.push(fromItem(item, item.id));
	}

	// Plus récent d'abord ; le nom départage pour un ordre stable entre deux scans.
	entries.sort((a, b) => b.createdAt - a.createdAt || a.file.localeCompare(b.file));

	return json(
		{
			entries,
			ledger: LEDGER_FILE,
			scannedAt: Date.now(),
			warnings: [...index.warnings, ...warnings]
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
