import type { SortKey } from '$lib/gallery.svelte';
import type { DeleteErrorCode } from '$lib/types';
import { pluralizer } from './plural';

const plural = pluralizer('en');

/**
 * Dictionnaire de référence : son type devient `Messages`, le contrat que
 * toutes les autres langues doivent remplir à l'identique.
 *
 * Conventions :
 * - Les segments entre accents graves (`generations/`) sont rendus en `<code>`
 *   par le composant `Rich`. Jamais de HTML dans une traduction.
 * - Tout texte qui dépend d'un nombre ou d'une valeur est une fonction : c'est
 *   ce qui rend les pluriels et les paramètres vérifiables par le compilateur.
 */
export const en = {
	language: {
		label: 'Language'
	},

	live: {
		on: 'Watching for new files',
		off: 'Offline'
	},

	common: {
		retry: 'Retry',
		copy: 'copy',
		copied: 'copied',
		reset: 'reset',
		readWarnings: (count: number) => plural(count, `${count} read warning`, `${count} read warnings`)
	},

	sort: {
		newest: 'Newest',
		oldest: 'Oldest',
		'cost-desc': 'Cost ↓',
		'size-desc': 'Size ↓',
		name: 'Name A→Z'
	} satisfies Record<SortKey, string>,

	bar: {
		searchPlaceholder: 'Search a prompt, a model, a tag…',
		searchLabel: 'Search',
		sortBy: 'Sort by',
		filters: 'Filters',
		spend: 'Spend',
		spendTitle: 'Spend by provider',
		type: 'Type',
		images: 'Images',
		videos: 'Videos',
		model: 'Model',
		service: 'Service',
		tags: 'Tags',
		facetsHint: 'Add `.json` sidecars next to your files to filter by model, service or tag.',
		generations: (count: number) => plural(count, 'generation', 'generations'),
		ofTotal: (total: number) => `of ${total}`,
		totalConverted: 'Total converted to euros',
		excludedFromTotal: (count: number) =>
			plural(
				count,
				`${count} amount excluded from the total: currency with no conversion rate`,
				`${count} amounts excluded from the total: currency with no conversion rate`
			),
		notConverted: (count: number) => `+${count} not converted`
	},

	wall: {
		loading: 'Reading the `generations/` folder…',
		errorTitle: "Couldn't read the index",
		emptyTitle: 'The wall is empty',
		emptyBody:
			'Drop your generated images and videos into `generations/`, each with a `.json` file of the same name next to it. They will show up here without a reload.',
		noResultsTitle: 'No results',
		noResultsBody: 'No generation matches this search.',
		resetFilters: 'Reset filters'
	},

	tile: {
		open: (label: string) => `Open: ${label}`,
		fresh: 'new'
	},

	clamped: {
		more: 'show more',
		less: 'show less'
	},

	lightbox: {
		dialogLabel: 'Generation details',
		previous: 'Previous',
		next: 'Next',
		close: 'Close',
		prompt: 'Prompt',
		noPrompt: 'No prompt recorded in the sidecar.',
		negativePrompt: 'Negative prompt',
		model: 'Model',
		service: 'Service',
		type: 'Type',
		image: 'Image',
		video: 'Video',
		dimensions: 'Dimensions',
		duration: 'Duration',
		size: 'Size',
		cost: 'Estimated cost',
		convertedTitle: 'Amount billed by the service, converted for reference only',
		convertedFrom: (amount: string) => `converted from ${amount}`,
		noRate: (currency: string) => `${currency} has no conversion rate`,
		date: 'Date',
		seed: 'Seed',
		tags: 'Tags',
		notes: 'Notes',
		extras: 'Other metadata',
		file: 'File',
		copyPath: 'Copy path',
		noSidecar: 'No metadata file attached.',
		badSidecar: (reason: string) => `Unreadable sidecar: ${reason}`,
		openRaw: 'Open raw file ↗',
		confirmDelete: (withSidecar: boolean) =>
			`Permanently delete this file${withSidecar ? ' and its sidecar' : ''}? This cannot be undone.`,
		delete: 'Delete',
		deleting: 'Deleting…',
		cancel: 'Cancel',
		deleteTrigger: 'Delete this media',
		deleteFailed: (reason: string) => `Delete failed: ${reason}`,
		deleteErrors: {
			not_found: 'the file is no longer on disk.',
			ledger_failed: 'the spend could not be written to the ledger, so nothing was deleted.',
			unlink_failed: 'the file could not be removed. The ledger was left unchanged.'
		} satisfies Record<DeleteErrorCode, string>
	},

	stats: {
		pageTitle: 'Spend · higgsphere',
		title: 'Spend',
		back: 'The wall',
		loading: 'Reading spend…',
		errorTitle: "Couldn't read spend",
		emptyTitle: 'No spend recorded',
		emptyBody:
			'Every generation dropped into `generations/` with a `cost` field in its sidecar shows up here, and stays even after its media is deleted.',
		totalSpent: 'Total spent',
		generations: (count: number) => plural(count, `${count} generation`, `${count} generations`),
		since: (date: string) => `since ${date}`,
		averageCost: 'Average cost',
		averageSub: 'per generation with a known cost',
		lastSpend: 'Latest spend',
		withoutCost: (count: number) =>
			plural(count, `${count} generation has no cost.`, `${count} generations have no cost.`),
		unconvertible: (count: number) =>
			plural(
				count,
				`${count} amount is in a currency with no known rate and is excluded from the total.`,
				`${count} amounts are in a currency with no known rate and are excluded from the total.`
			),
		caveatEnd: 'The total only counts what it can convert.',
		noMatchTitle: 'No spend',
		noMatchBody: 'No spend matches this selection.',
		resetButton: 'Reset',
		timeline: 'Timeline',
		byMonth: 'by month',
		byDay: 'by day',
		oldestLeft: 'oldest on the left',
		chartLabel: 'Spend over time',
		byProvider: 'By provider',
		providers: (count: number) => plural(count, `${count} provider`, `${count} providers`),
		shareOfTotal: (percent: string) => `${percent} of total`,
		deleted: (count: number) => `${count} deleted`,
		withoutCostShort: (count: number) => `${count} without cost`,
		notConverted: (count: number) => `${count} not converted`,
		journal: 'Log',
		newestFirst: 'newest first',
		deletedOn: (date: string) => `Media deleted on ${date}`,
		deletedBadge: 'deleted',
		image: 'image',
		unknownService: 'Unknown provider',
		unknownModel: 'Unknown model',
		ledgerNote: (path: string) =>
			`Every generation is recorded in \`${path}\` as soon as it appears: its price keeps counting here after the media is deleted.`
	}
};

export type Messages = typeof en;
