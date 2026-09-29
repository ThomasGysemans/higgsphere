import type { Messages } from './en';
import { pluralizer } from './plural';

const plural = pluralizer('fr');

export const fr: Messages = {
	language: {
		label: 'Langue'
	},

	currency: {
		label: 'Devise'
	},

	live: {
		on: 'Surveillance active',
		off: 'Hors ligne'
	},

	common: {
		retry: 'Réessayer',
		copy: 'copier',
		copied: 'copié',
		reset: 'réinitialiser',
		readWarnings: (count) =>
			plural(count, `${count} avertissement de lecture`, `${count} avertissements de lecture`)
	},

	sort: {
		newest: 'Plus récent',
		oldest: 'Plus ancien',
		'cost-desc': 'Coût ↓',
		'size-desc': 'Poids ↓',
		name: 'Nom A→Z'
	},

	bar: {
		searchPlaceholder: 'Rechercher un prompt, un modèle, un tag…',
		searchLabel: 'Rechercher',
		sortBy: 'Trier par',
		filters: 'Filtres',
		spend: 'Dépenses',
		spendTitle: 'Dépenses par fournisseur',
		type: 'Type',
		images: 'Images',
		videos: 'Vidéos',
		model: 'Modèle',
		service: 'Service',
		tags: 'Tags',
		facetsHint:
			'Ajoutez des sidecars `.json` à côté de vos fichiers pour filtrer par modèle, service ou tag.',
		generations: (count) => plural(count, 'génération', 'générations'),
		ofTotal: (total) => `sur ${total}`,
		totalConverted: (currency) => `Total converti en ${currency}`,
		excludedFromTotal: (count) =>
			plural(
				count,
				`${count} montant exclu du total : devise sans taux de conversion`,
				`${count} montants exclus du total : devise sans taux de conversion`
			),
		notConverted: (count) => plural(count, `+${count} non converti`, `+${count} non convertis`)
	},

	wall: {
		loading: 'Lecture du dossier `generations/`…',
		errorTitle: "Impossible de lire l'index",
		emptyTitle: 'Le mur est vide',
		emptyBody:
			'Déposez vos images et vidéos générées dans `generations/`, avec un fichier `.json` du même nom à côté. Elles apparaîtront ici sans rechargement.',
		noResultsTitle: 'Aucun résultat',
		noResultsBody: 'Aucune génération ne correspond à cette recherche.',
		resetFilters: 'Réinitialiser les filtres'
	},

	tile: {
		open: (label) => `Ouvrir : ${label}`,
		fresh: 'nouveau'
	},

	clamped: {
		more: 'voir plus',
		less: 'voir moins'
	},

	lightbox: {
		dialogLabel: 'Détail de la génération',
		previous: 'Précédent',
		next: 'Suivant',
		close: 'Fermer',
		prompt: 'Prompt',
		noPrompt: 'Aucun prompt enregistré dans le sidecar.',
		negativePrompt: 'Prompt négatif',
		model: 'Modèle',
		service: 'Service',
		type: 'Type',
		image: 'Image',
		video: 'Vidéo',
		dimensions: 'Dimensions',
		duration: 'Durée',
		size: 'Poids',
		cost: 'Coût estimé',
		convertedTitle: 'Montant facturé par le service, converti à titre indicatif',
		convertedFrom: (amount) => `converti de ${amount}`,
		noRate: (currency) => `devise ${currency} sans taux de conversion`,
		date: 'Date',
		seed: 'Seed',
		tags: 'Tags',
		notes: 'Notes',
		extras: 'Autres métadonnées',
		file: 'Fichier',
		copyPath: 'Copier le chemin',
		noSidecar: 'Aucun fichier de métadonnées associé.',
		badSidecar: (reason) => `Sidecar illisible : ${reason}`,
		openRaw: 'Ouvrir le fichier brut ↗',
		confirmDelete: (withSidecar) =>
			`Supprimer définitivement ce fichier${withSidecar ? ' et son sidecar' : ''} ? Cette action est irréversible.`,
		delete: 'Supprimer',
		deleting: 'Suppression…',
		cancel: 'Annuler',
		deleteTrigger: 'Supprimer ce média',
		deleteFailed: (reason) => `Échec de la suppression : ${reason}`,
		deleteErrors: {
			not_found: "le fichier n'est plus sur le disque.",
			ledger_failed:
				"la dépense n'a pas pu être inscrite au journal, donc rien n'a été supprimé.",
			unlink_failed: "le fichier n'a pas pu être effacé. Le journal est resté inchangé."
		}
	},

	stats: {
		pageTitle: 'Dépenses · higgsphere',
		title: 'Dépenses',
		back: 'Le mur',
		loading: 'Lecture des dépenses…',
		errorTitle: 'Impossible de lire les dépenses',
		emptyTitle: 'Aucune dépense enregistrée',
		emptyBody:
			'Chaque génération déposée dans `generations/` avec un champ `cost` dans son sidecar apparaîtra ici — et y restera même après la suppression du média.',
		totalSpent: 'Total dépensé',
		generations: (count) => plural(count, `${count} génération`, `${count} générations`),
		since: (date) => `depuis le ${date}`,
		averageCost: 'Coût moyen',
		averageSub: 'par génération dont le coût est connu',
		lastSpend: 'Dernière dépense',
		withoutCost: (count) =>
			plural(
				count,
				`${count} génération sans coût renseigné.`,
				`${count} générations sans coût renseigné.`
			),
		unconvertible: (count) =>
			plural(
				count,
				`${count} montant dans une devise sans taux connu, exclu du total.`,
				`${count} montants dans une devise sans taux connu, exclus du total.`
			),
		caveatEnd: "Le total ne compte que ce qu'il peut convertir.",
		noMatchTitle: 'Aucune dépense',
		noMatchBody: 'Aucune dépense ne correspond à cette sélection.',
		resetButton: 'Réinitialiser',
		timeline: 'Chronologie',
		byMonth: 'par mois',
		byDay: 'par jour',
		oldestLeft: 'plus ancien à gauche',
		chartLabel: 'Dépenses au fil du temps',
		byProvider: 'Par fournisseur',
		providers: (count) => plural(count, `${count} fournisseur`, `${count} fournisseurs`),
		shareOfTotal: (percent) => `${percent} du total`,
		deleted: (count) => plural(count, `${count} supprimée`, `${count} supprimées`),
		withoutCostShort: (count) => `${count} sans coût`,
		notConverted: (count) => plural(count, `${count} non converti`, `${count} non convertis`),
		journal: 'Journal',
		newestFirst: "plus récent d'abord",
		deletedOn: (date) => `Média supprimé le ${date}`,
		deletedBadge: 'supprimé',
		image: 'image',
		unknownService: 'Fournisseur inconnu',
		unknownModel: 'Modèle inconnu',
		ledgerNote: (path) =>
			`Chaque génération est inscrite dans \`${path}\` dès son apparition : son prix reste compté ici même après la suppression du média.`
	}
};
