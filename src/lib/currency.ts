/**
 * Conversion des coûts vers l'euro, pour l'affichage uniquement.
 *
 * Les sidecars conservent le montant dans la devise facturée par le service
 * (presque toujours l'USD) : c'est la donnée d'origine, elle n'est jamais
 * réécrite. La conversion se fait au moment de l'affichage.
 */

/** Devise dans laquelle le mur affiche tous les montants. */
export const DISPLAY_CURRENCY = 'EUR';

/**
 * Devise supposée quand un sidecar ne déclare pas de champ `currency`.
 * Les services IA facturent en dollars ; c'est le pari le moins surprenant.
 */
export const ASSUMED_CURRENCY = 'USD';

/**
 * Combien vaut 1 unité de la devise en euros.
 *
 * ⚠️ Ces taux sont figés dans le code : l'outil ne fait aucun appel réseau.
 * Ce sont des ordres de grandeur, pas des taux du jour — relisez-les et
 * ajustez-les, un taux périmé fausse silencieusement le total affiché.
 * Dernier ajustement : 2026-08-31.
 */
export const RATES_TO_EUR: Record<string, number> = {
	EUR: 1,
	USD: 0.92,
	GBP: 1.17,
	CHF: 1.05,
	CAD: 0.68,
	AUD: 0.61,
	JPY: 0.0062
};

export interface ConvertedCost {
	/** Montant en euros, `null` si la devise d'origine est inconnue. */
	eur: number | null;
	/** Montant tel qu'enregistré dans le sidecar. */
	source: number;
	sourceCurrency: string;
	/** Vrai si la devise d'origine n'était pas déjà l'euro. */
	converted: boolean;
}

/** Normalise un code devise (`usd`, ` USD ` → `USD`). */
export function normalizeCurrency(currency: string | null | undefined): string {
	const trimmed = currency?.trim();
	return (trimmed ? trimmed : ASSUMED_CURRENCY).toUpperCase();
}

/**
 * Convertit un montant vers l'euro.
 *
 * Une devise absente de la table renvoie `eur: null` plutôt qu'un chiffre
 * inventé : mieux vaut un montant non converti et signalé qu'un total faux.
 */
export function toEur(amount: number | null, currency?: string | null): ConvertedCost | null {
	if (amount === null || !Number.isFinite(amount)) return null;

	const sourceCurrency = normalizeCurrency(currency);
	const rate = RATES_TO_EUR[sourceCurrency];

	return {
		eur: rate === undefined ? null : amount * rate,
		source: amount,
		sourceCurrency,
		converted: rate !== undefined && sourceCurrency !== DISPLAY_CURRENCY
	};
}

/** Valeur en euros utilisable dans une somme ou un tri ; 0 si non convertible. */
export function eurValue(amount: number | null, currency?: string | null): number {
	return toEur(amount, currency)?.eur ?? 0;
}
