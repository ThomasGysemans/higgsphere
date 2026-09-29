export type MediaKind = 'image' | 'video';

/**
 * Échecs de `DELETE /api/generations` qu'un utilisateur peut réellement
 * rencontrer depuis l'interface. Le serveur renvoie ce code avec un message
 * technique en anglais ; le client affiche la phrase traduite correspondante.
 */
export type DeleteErrorCode = 'not_found' | 'ledger_failed' | 'unlink_failed';

export interface DeleteError {
	code: DeleteErrorCode | null;
	/** Message brut du serveur : sert de repli, et de détail technique. */
	message: string;
}

/**
 * Forme d'un fichier `.json` compagnon posé à côté d'un média généré.
 * Tous les champs sont optionnels : un média sans sidecar apparaît quand même
 * dans la galerie, il porte simplement moins d'informations.
 */
export interface GenerationMeta {
	prompt?: string;
	negative_prompt?: string;
	model?: string;
	service?: string;
	width?: number;
	height?: number;
	duration?: number;
	cost?: number;
	currency?: string;
	created_at?: string;
	seed?: number | string;
	tags?: string[];
	notes?: string;
	poster?: string;
	[key: string]: unknown;
}

/** Une tuile du mur, telle que calculée par le serveur. */
export interface GenerationItem {
	id: string;
	file: string;
	url: string;
	name: string;
	kind: MediaKind;
	ext: string;
	bytes: number;
	createdAt: number;
	width: number | null;
	height: number | null;
	aspect: number | null;
	duration: number | null;
	cost: number | null;
	currency: string;
	model: string | null;
	service: string | null;
	prompt: string;
	tags: string[];
	seed: string | null;
	notes: string | null;
	posterUrl: string | null;
	sidecar: string | null;
	metaError: string | null;
	meta: GenerationMeta;
}

export interface GalleryFacets {
	models: string[];
	services: string[];
	tags: string[];
	kinds: MediaKind[];
	totalBytes: number;
}

export interface GalleryIndex {
	items: GenerationItem[];
	facets: GalleryFacets;
	root: string;
	scannedAt: number;
	warnings: string[];
}

/**
 * Le journal des dépenses est un **journal d'événements**, pas une liste d'objets :
 * chaque ligne dit ce qui est arrivé à une génération, et l'état courant se
 * reconstruit en repliant les lignes dans l'ordre. C'est ce qui permet de rester
 * en ajout seul tout en corrigeant un coût, en suivant un fichier déplacé ou en
 * constatant une disparition.
 */
export type LedgerEventKind = 'created' | 'updated' | 'deleted';

/** L'état connu d'une génération au moment où l'événement est écrit. */
export interface LedgerPayload {
	file: string;
	name: string;
	kind: MediaKind;
	cost: number | null;
	currency: string;
	service: string | null;
	model: string | null;
	created_at: string;
	duration: number | null;
	width: number | null;
	height: number | null;
	bytes: number;
	prompt?: string;
	tags?: string[];
	seed?: string;
	notes?: string;
}

export interface LedgerEvent extends LedgerPayload {
	event: LedgerEventKind;
	/**
	 * Identité de la génération, attribuée à sa naissance et stable ensuite.
	 * Le chemin ne peut pas servir de clé : un fichier se déplace, et un même nom
	 * peut être régénéré après suppression.
	 */
	id: string;
	/** Horodatage de l'événement lui-même, distinct de `created_at`. */
	at: string;
	/** Pour `deleted` : `app` (depuis le lightbox) ou `missing` (disparu du disque). */
	reason?: string;
}

/** Une génération reconstruite depuis le journal, vivante ou disparue. */
export interface LedgerGeneration extends LedgerPayload {
	id: string;
	deletedAt: string | null;
	deletedReason: string | null;
}

/**
 * Une dépense, que le média existe encore ou non. C'est l'unité de la page de
 * statistiques : le mur montre des fichiers, la page des dépenses montre des
 * paiements — et un paiement ne s'annule pas parce qu'on efface le fichier.
 */
export interface SpendEntry {
	id: string;
	file: string;
	name: string;
	kind: MediaKind;
	cost: number | null;
	currency: string;
	service: string | null;
	model: string | null;
	/** Date de la génération. */
	createdAt: number;
	/** Date de suppression, `null` si le média est toujours dans le mur. */
	deletedAt: number | null;
	duration: number | null;
	bytes: number;
	prompt: string;
	tags: string[];
	/** Lien vers le média, `null` s'il a été supprimé. */
	url: string | null;
}

export interface SpendIndex {
	entries: SpendEntry[];
	ledger: string;
	scannedAt: number;
	warnings: string[];
}
