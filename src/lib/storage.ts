/**
 * Préférences de l'utilisateur (langue, devise) mémorisées dans le navigateur.
 *
 * Le stockage peut être absent ou bloqué (navigation privée, politique du
 * navigateur) : une préférence perdue n'est jamais une erreur, l'interface
 * retombe simplement sur sa valeur par défaut.
 */
export function readPreference(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writePreference(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Le choix vaut pour cette session seulement ; rien de grave.
	}
}
