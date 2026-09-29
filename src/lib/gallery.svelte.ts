import type { GalleryFacets, GalleryIndex, GenerationItem, MediaKind } from './types';
import { eurValue, toEur } from './currency';

export type SortKey = 'newest' | 'oldest' | 'cost-desc' | 'size-desc' | 'name';

export const SORT_LABELS: Record<SortKey, string> = {
	newest: 'Plus récent',
	oldest: 'Plus ancien',
	'cost-desc': 'Coût ↓',
	'size-desc': 'Poids ↓',
	name: 'Nom A→Z'
};

const EMPTY_FACETS: GalleryFacets = {
	models: [],
	services: [],
	tags: [],
	kinds: [],
	totalBytes: 0
};

/** Formes de repli utilisées tant que le vrai ratio est inconnu. */
const DEFAULT_ASPECT = { image: 1, video: 16 / 9 };

/** Découpe une requête en termes, en gardant les "phrases entre guillemets". */
function tokenize(query: string): string[] {
	const tokens: string[] = [];
	const pattern = /"([^"]+)"|(\S+)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(query)) !== null) {
		const token = (match[1] ?? match[2]).toLowerCase().trim();
		if (token) tokens.push(token);
	}
	return tokens;
}

function haystack(item: GenerationItem): string {
	return [
		item.prompt,
		item.name,
		item.file,
		item.model,
		item.service,
		item.notes,
		item.seed,
		item.tags.join(' ')
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

function toggle(list: string[], value: string): string[] {
	return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

class GalleryStore {
	items = $state<GenerationItem[]>([]);
	facets = $state<GalleryFacets>(EMPTY_FACETS);
	warnings = $state<string[]>([]);
	root = $state('');

	/**
	 * Démarre à « loading » : un état initial neutre tomberait dans la branche
	 * « le mur est vide » de la page, qui clignoterait à chaque rechargement
	 * avant l'arrivée des données.
	 */
	status = $state<'loading' | 'ready' | 'error'>('loading');
	error = $state<string | null>(null);
	live = $state(false);
	lastSync = $state(0);
	freshIds = $state<string[]>([]);

	query = $state('');
	kinds = $state<MediaKind[]>([]);
	models = $state<string[]>([]);
	services = $state<string[]>([]);
	tags = $state<string[]>([]);
	sort = $state<SortKey>('newest');

	/** Ratios mesurés dans le navigateur, indexés par id (surtout les vidéos). */
	measured = $state<Record<string, number>>({});

	selectedId = $state<string | null>(null);

	/** Id du média en cours de suppression, pour neutraliser l'interface. */
	deleting = $state<string | null>(null);
	deleteError = $state<string | null>(null);

	#source: EventSource | null = null;
	#inFlight: Promise<void> | null = null;

	filtered = $derived.by(() => {
		const tokens = tokenize(this.query);
		const result = this.items.filter((item) => {
			if (this.kinds.length && !this.kinds.includes(item.kind)) return false;
			if (this.models.length && (!item.model || !this.models.includes(item.model))) return false;
			if (this.services.length && (!item.service || !this.services.includes(item.service)))
				return false;
			if (this.tags.length && !this.tags.some((tag) => item.tags.includes(tag))) return false;
			if (!tokens.length) return true;
			const text = haystack(item);
			return tokens.every((token) => text.includes(token));
		});

		const sorters: Record<SortKey, (a: GenerationItem, b: GenerationItem) => number> = {
			newest: (a, b) => b.createdAt - a.createdAt,
			oldest: (a, b) => a.createdAt - b.createdAt,
			// Comparaison en euros : trier sur les montants bruts mélangerait les devises.
			'cost-desc': (a, b) => eurValue(b.cost, b.currency) - eurValue(a.cost, a.currency),
			'size-desc': (a, b) => b.bytes - a.bytes,
			name: (a, b) => a.name.localeCompare(b.name)
		};
		// Le nom de fichier départage : le mur ne se réorganise pas entre deux scans.
		return result.sort((a, b) => sorters[this.sort](a, b) || a.file.localeCompare(b.file));
	});

	activeFilterCount = $derived(
		this.kinds.length +
			this.models.length +
			this.services.length +
			this.tags.length +
			(this.query.trim() ? 1 : 0)
	);

	selected = $derived(this.filtered.find((item) => item.id === this.selectedId) ?? null);

	selectedIndex = $derived(this.filtered.findIndex((item) => item.id === this.selectedId));

	/** Somme des coûts visibles, convertie en euros. */
	visibleCost = $derived(
		this.filtered.reduce((sum, item) => sum + eurValue(item.cost, item.currency), 0)
	);

	/**
	 * Nombre de coûts visibles qu'aucun taux ne permet de convertir : ils sont
	 * exclus du total, et le signaler évite d'afficher une somme muettement basse.
	 */
	unconvertibleCount = $derived(
		this.filtered.filter((item) => toEur(item.cost, item.currency)?.eur === null).length
	);

	visibleBytes = $derived(this.filtered.reduce((sum, item) => sum + item.bytes, 0));

	/** Ratio à utiliser pour poser la tuile, avant même le chargement du média. */
	aspectOf(item: GenerationItem): number {
		return item.aspect ?? this.measured[item.id] ?? DEFAULT_ASPECT[item.kind];
	}

	/** Appelé dès qu'un élément du navigateur rapporte sa taille intrinsèque. */
	reportAspect(id: string, width: number, height: number) {
		if (!width || !height) return;
		const aspect = width / height;
		if (Math.abs((this.measured[id] ?? 0) - aspect) < 0.001) return;
		this.measured = { ...this.measured, [id]: aspect };
	}

	toggleKind(kind: MediaKind) {
		this.kinds = toggle(this.kinds, kind) as MediaKind[];
	}
	toggleModel(model: string) {
		this.models = toggle(this.models, model);
	}
	toggleService(service: string) {
		this.services = toggle(this.services, service);
	}
	toggleTag(tag: string) {
		this.tags = toggle(this.tags, tag);
	}

	resetFilters() {
		this.query = '';
		this.kinds = [];
		this.models = [];
		this.services = [];
		this.tags = [];
	}

	select(id: string | null) {
		this.selectedId = id;
	}

	/** Déplace le lightbox dans la liste actuellement filtrée. */
	step(delta: number) {
		if (!this.filtered.length) return;
		const current = this.selectedIndex;
		if (current < 0) return;
		const next = (current + delta + this.filtered.length) % this.filtered.length;
		this.selectedId = this.filtered[next].id;
	}

	/**
	 * Supprime définitivement un média et son sidecar.
	 *
	 * Le lightbox se ferme sur une suppression réussie : enchaîner sur la
	 * génération suivante ferait apparaître un média sous le curseur, à l'endroit
	 * exact où l'on vient de confirmer un effacement — et la suivante n'est pas
	 * celle qu'on avait ouverte.
	 */
	async remove(id: string) {
		const item = this.items.find((entry) => entry.id === id);
		if (!item || this.deleting) return;

		this.deleting = id;
		this.deleteError = null;

		try {
			const response = await fetch('/api/generations', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ file: item.file })
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.message ?? `HTTP ${response.status}`);
			}

			// Retrait immédiat : le rescan déclenché par fs.watch arriverait trop tard
			// pour que la disparition paraisse instantanée.
			this.items = this.items.filter((entry) => entry.id !== id);
			if (this.selectedId === id) this.selectedId = null;
			await this.refresh();
		} catch (error) {
			this.deleteError = (error as Error).message;
		} finally {
			this.deleting = null;
		}
	}

	async refresh() {
		// Les rafraîchissements se chevauchent souvent quand un lot de fichiers arrive.
		if (this.#inFlight) return this.#inFlight;

		this.#inFlight = (async () => {
			try {
				const response = await fetch('/api/generations', { headers: { accept: 'application/json' } });
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const index: GalleryIndex = await response.json();

				const known = new Set(this.items.map((item) => item.id));
				const appeared = this.items.length
					? index.items.filter((item) => !known.has(item.id)).map((item) => item.id)
					: [];

				this.items = index.items;
				this.facets = index.facets;
				this.warnings = index.warnings;
				this.root = index.root;
				this.lastSync = Date.now();
				this.status = 'ready';
				this.error = null;

				if (appeared.length) {
					this.freshIds = appeared;
					setTimeout(() => {
						this.freshIds = this.freshIds.filter((id) => !appeared.includes(id));
					}, 4000);
				}
			} catch (error) {
				this.status = 'error';
				this.error = (error as Error).message;
			} finally {
				this.#inFlight = null;
			}
		})();

		return this.#inFlight;
	}

	/** Ouvre le canal SSE pour que les nouveaux fichiers arrivent sans rechargement. */
	connect(): () => void {
		this.#source?.close();
		const source = new EventSource('/api/generations/stream');
		this.#source = source;

		source.addEventListener('ready', () => {
			this.live = true;
		});
		source.addEventListener('change', () => {
			void this.refresh();
		});
		source.onopen = () => {
			this.live = true;
		};
		source.onerror = () => {
			// EventSource se reconnecte seul ; on reflète simplement la coupure dans l'UI.
			this.live = false;
		};

		return () => {
			source.close();
			this.#source = null;
			this.live = false;
		};
	}
}

export const gallery = new GalleryStore();
