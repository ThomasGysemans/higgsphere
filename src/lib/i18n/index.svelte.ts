import { en, type Messages } from './en';
import { fr } from './fr';
import { es } from './es';
import { readPreference, writePreference } from '../storage';

/**
 * Langues de l'interface. Seul le « chrome » est traduit : prompts, notes,
 * tags, noms de modèles et tout ce qui vient d'un sidecar s'affichent tels
 * qu'ils ont été écrits.
 *
 * Pour ajouter une langue : un fichier `xx.ts` typé `Messages`, puis une ligne
 * ici. `npm run check` refuse toute clé manquante ou en trop.
 */
export const LOCALES = [
	{ code: 'en', name: 'English', messages: en },
	{ code: 'fr', name: 'Français', messages: fr },
	{ code: 'es', name: 'Español', messages: es }
] as const satisfies readonly { code: string; name: string; messages: Messages }[];

export type Locale = (typeof LOCALES)[number]['code'];

export const DEFAULT_LOCALE: Locale = 'en';

const STORAGE_KEY = 'higgsphere.locale';

function isLocale(value: unknown): value is Locale {
	return LOCALES.some((locale) => locale.code === value);
}

/**
 * Choix explicite mémorisé d'abord, puis langue du navigateur, puis anglais.
 *
 * Lu de façon synchrone au chargement du module : le rendu est exclusivement
 * client, donc la première frame est déjà dans la bonne langue — aucun flash
 * de texte anglais avant bascule.
 */
function detect(): Locale {
	if (typeof navigator === 'undefined') return DEFAULT_LOCALE;

	const saved = readPreference(STORAGE_KEY);
	if (isLocale(saved)) return saved;

	for (const tag of navigator.languages ?? [navigator.language]) {
		const base = tag?.toLowerCase().split('-')[0];
		if (isLocale(base)) return base;
	}
	return DEFAULT_LOCALE;
}

class I18n {
	locale = $state<Locale>(detect());

	/** Dictionnaire actif : `i18n.m.bar.filters`, réactif au changement de langue. */
	m = $derived<Messages>(LOCALES.find((entry) => entry.code === this.locale)!.messages);

	constructor() {
		this.#syncDocument();
	}

	set(locale: Locale) {
		this.locale = locale;
		this.#syncDocument();
		writePreference(STORAGE_KEY, locale);
	}

	/** `lang` sur `<html>` : lecteurs d'écran, césure et correcteur en dépendent. */
	#syncDocument() {
		if (typeof document !== 'undefined') document.documentElement.lang = this.locale;
	}
}

export const i18n = new I18n();
