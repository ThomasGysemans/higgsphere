import type { SpendEntry, SpendIndex } from './types';
import { eurValue, toEur } from './currency';
import { i18n } from './i18n/index.svelte';

/**
 * État client de la page des dépenses.
 *
 * Le mur compte des fichiers, cette page compte des paiements : elle lit
 * `/api/spend`, qui réunit les sidecars encore présents et le journal des
 * générations supprimées. Un média effacé continue donc de peser dans le total.
 */

/**
 * Clé de regroupement des dépenses dont le sidecar ne déclarait aucun service.
 *
 * C'est une identité, pas un libellé : elle sert de clé de palette et de
 * filtre, et doit donc survivre à un changement de langue. Le texte affiché
 * (« Fournisseur inconnu »…) vient du dictionnaire, au rendu. Un vrai service
 * ne peut pas valoir `''` : `serviceOf` retombe ici sur toute valeur vide.
 */
export const UNKNOWN_SERVICE = '';

/** Idem pour le modèle. */
export const UNKNOWN_MODEL = '';

/**
 * Couleurs des fournisseurs, assignées par rang de dépense (le plus gros
 * poste garde la même couleur d'un rechargement à l'autre).
 */
const PROVIDER_COLORS = [
	'#8b6cff',
	'#3ddbb4',
	'#f0b429',
	'#ff6b7a',
	'#4aa8ff',
	'#e879f9',
	'#94e36a',
	'#ff9f45'
];

export interface ModelStat {
	model: string;
	eur: number;
	count: number;
}

export interface ProviderStat {
	service: string;
	color: string;
	/** Total converti en euros. */
	eur: number;
	count: number;
	/** Générations dont le média a été supprimé. */
	deleted: number;
	/** Générations sans champ `cost` : elles ne pèsent rien dans le total. */
	withoutCost: number;
	/** Montants qu'aucun taux ne permet de convertir : exclus du total. */
	unconvertible: number;
	first: number;
	last: number;
	/** Part du total, entre 0 et 1. */
	share: number;
	models: ModelStat[];
}

export interface SpendBucket {
	key: string;
	at: number;
	label: string;
	/** Libellé court de l'axe, sans l'année. */
	tick: string;
	eur: number;
	count: number;
	/** Répartition du montant par fournisseur, pour la barre empilée. */
	slices: { service: string; color: string; eur: number }[];
	entries: SpendEntry[];
}

export type Granularity = 'day' | 'month';

/** Au-delà, la chronologie quotidienne devient illisible : on passe au mois. */
const MONTHLY_THRESHOLD_DAYS = 75;

const DAY_MS = 86_400_000;

export function serviceOf(entry: SpendEntry): string {
	return entry.service?.trim() || UNKNOWN_SERVICE;
}

/** Clé de regroupement calculée en heure locale : un média du soir reste ce soir-là. */
function bucketKey(at: number, granularity: Granularity): string {
	const date = new Date(at);
	const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	return granularity === 'month' ? month : `${month}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Libellés dans la langue de l'interface. L'année est retirée des graduations
 * en la demandant absente à Intl, pas en la coupant après coup : sa place et
 * sa ponctuation varient d'une langue à l'autre (« 29 sept. 2026 »,
 * « Sep 29, 2026 »).
 */
function bucketLabel(at: number, granularity: Granularity, withYear = true): string {
	const year = withYear ? ({ year: 'numeric' } as const) : {};
	return new Intl.DateTimeFormat(
		i18n.locale,
		granularity === 'month'
			? { month: withYear ? 'long' : 'short', ...year }
			: { weekday: 'short', day: 'numeric', month: 'short', ...year }
	).format(new Date(at));
}

class SpendStore {
	entries = $state<SpendEntry[]>([]);
	warnings = $state<string[]>([]);
	ledger = $state('');

	/** Même raison que dans le mur : « loading » évite un clignotement d'état vide. */
	status = $state<'loading' | 'ready' | 'error'>('loading');
	error = $state<string | null>(null);
	live = $state(false);
	lastSync = $state(0);

	/** Fournisseurs sélectionnés ; vide = tous. */
	services = $state<string[]>([]);

	#source: EventSource | null = null;
	#inFlight: Promise<void> | null = null;

	/**
	 * Palette stable : le rang est calculé sur *toutes* les dépenses, pas sur la
	 * sélection courante, pour qu'un filtre ne change pas la couleur d'un poste.
	 */
	palette = $derived.by(() => {
		const totals = new Map<string, number>();
		for (const entry of this.entries) {
			const service = serviceOf(entry);
			totals.set(service, (totals.get(service) ?? 0) + eurValue(entry.cost, entry.currency));
		}
		const ordered = [...totals.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([service]) => service);

		const colors = new Map<string, string>();
		ordered.forEach((service, index) => {
			colors.set(service, PROVIDER_COLORS[index % PROVIDER_COLORS.length]);
		});
		return colors;
	});

	colorOf(service: string): string {
		return this.palette.get(service) ?? PROVIDER_COLORS[0];
	}

	/** Tous les fournisseurs connus, du plus dépensier au moins dépensier. */
	allServices = $derived([...this.palette.keys()]);

	/**
	 * Les générations supprimées ne sont jamais filtrables : le fichier a disparu,
	 * pas le paiement. Seul le fournisseur restreint la vue.
	 */
	filtered = $derived(
		this.services.length
			? this.entries.filter((entry) => this.services.includes(serviceOf(entry)))
			: this.entries
	);

	totals = $derived.by(() => {
		let eur = 0;
		let withoutCost = 0;
		let unconvertible = 0;

		for (const entry of this.filtered) {
			if (entry.cost === null) withoutCost += 1;
			else if (toEur(entry.cost, entry.currency)?.eur === null) unconvertible += 1;

			eur += eurValue(entry.cost, entry.currency);
		}

		const dates = this.filtered.map((entry) => entry.createdAt);
		return {
			eur,
			count: this.filtered.length,
			withoutCost,
			unconvertible,
			/** Moyenne sur les seules générations dont le coût est connu et converti. */
			average: this.filtered.length - withoutCost - unconvertible > 0
				? eur / (this.filtered.length - withoutCost - unconvertible)
				: 0,
			first: dates.length ? Math.min(...dates) : 0,
			last: dates.length ? Math.max(...dates) : 0
		};
	});

	/** Une ligne par fournisseur, du plus coûteux au moins coûteux. */
	byProvider = $derived.by(() => {
		const stats = new Map<string, ProviderStat & { modelMap: Map<string, ModelStat> }>();

		for (const entry of this.filtered) {
			const service = serviceOf(entry);
			let stat = stats.get(service);
			if (!stat) {
				stat = {
					service,
					color: this.colorOf(service),
					eur: 0,
					count: 0,
					deleted: 0,
					withoutCost: 0,
					unconvertible: 0,
					first: entry.createdAt,
					last: entry.createdAt,
					share: 0,
					models: [],
					modelMap: new Map()
				};
				stats.set(service, stat);
			}

			const value = eurValue(entry.cost, entry.currency);
			stat.eur += value;
			stat.count += 1;
			if (entry.deletedAt !== null) stat.deleted += 1;
			if (entry.cost === null) stat.withoutCost += 1;
			else if (toEur(entry.cost, entry.currency)?.eur === null) stat.unconvertible += 1;
			stat.first = Math.min(stat.first, entry.createdAt);
			stat.last = Math.max(stat.last, entry.createdAt);

			const model = entry.model?.trim() || UNKNOWN_MODEL;
			const modelStat = stat.modelMap.get(model) ?? { model, eur: 0, count: 0 };
			modelStat.eur += value;
			modelStat.count += 1;
			stat.modelMap.set(model, modelStat);
		}

		const total = this.totals.eur;
		return [...stats.values()]
			.map(({ modelMap, ...stat }) => ({
				...stat,
				share: total > 0 ? stat.eur / total : 0,
				models: [...modelMap.values()].sort((a, b) => b.eur - a.eur || b.count - a.count)
			}))
			.sort((a, b) => b.eur - a.eur || b.count - a.count || a.service.localeCompare(b.service));
	});

	/** Jour ou mois, selon l'étendue de la période couverte. */
	granularity = $derived<Granularity>(
		(this.totals.last - this.totals.first) / DAY_MS > MONTHLY_THRESHOLD_DAYS ? 'month' : 'day'
	);

	/** Chronologie du plus ancien au plus récent : le temps se lit de gauche à droite. */
	buckets = $derived.by(() => {
		const granularity = this.granularity;
		const map = new Map<string, SpendBucket & { perService: Map<string, number> }>();

		for (const entry of this.filtered) {
			const key = bucketKey(entry.createdAt, granularity);
			let bucket = map.get(key);
			if (!bucket) {
				bucket = {
					key,
					at: entry.createdAt,
					label: bucketLabel(entry.createdAt, granularity),
					tick: bucketLabel(entry.createdAt, granularity, false),
					eur: 0,
					count: 0,
					slices: [],
					entries: [],
					perService: new Map()
				};
				map.set(key, bucket);
			}
			const value = eurValue(entry.cost, entry.currency);
			bucket.eur += value;
			bucket.count += 1;
			bucket.at = Math.min(bucket.at, entry.createdAt);
			bucket.entries.push(entry);
			const service = serviceOf(entry);
			bucket.perService.set(service, (bucket.perService.get(service) ?? 0) + value);
		}

		return [...map.values()]
			.map(({ perService, ...bucket }) => ({
				...bucket,
				// Le média le plus récent en premier dans le journal du jour.
				entries: bucket.entries.sort((a, b) => b.createdAt - a.createdAt),
				slices: [...perService.entries()]
					.sort((a, b) => b[1] - a[1])
					.map(([service, eur]) => ({ service, color: this.colorOf(service), eur }))
			}))
			.sort((a, b) => a.key.localeCompare(b.key));
	});

	/** Plus gros seau de la période : sert d'échelle aux barres. */
	peak = $derived(this.buckets.reduce((max, bucket) => Math.max(max, bucket.eur), 0));

	toggleService(service: string) {
		this.services = this.services.includes(service)
			? this.services.filter((entry) => entry !== service)
			: [...this.services, service];
	}

	reset() {
		this.services = [];
	}

	async refresh() {
		if (this.#inFlight) return this.#inFlight;

		this.#inFlight = (async () => {
			try {
				const response = await fetch('/api/spend', { headers: { accept: 'application/json' } });
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const index: SpendIndex = await response.json();

				this.entries = index.entries;
				this.warnings = index.warnings;
				this.ledger = index.ledger;
				this.lastSync = Date.now();
				this.status = 'ready';
				this.error = null;
			} catch (error) {
				this.status = 'error';
				this.error = (error as Error).message;
			} finally {
				this.#inFlight = null;
			}
		})();

		return this.#inFlight;
	}

	/**
	 * Réutilise le canal SSE du mur : toute apparition ou suppression de média y
	 * passe, et c'est exactement ce qui fait bouger les dépenses.
	 */
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
			this.live = false;
		};

		return () => {
			source.close();
			this.#source = null;
			this.live = false;
		};
	}
}

export const spend = new SpendStore();
