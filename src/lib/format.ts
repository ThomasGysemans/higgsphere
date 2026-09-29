import { fromEur, toEur } from './currency';
import { displayCurrency } from './display-currency.svelte';
import { i18n } from './i18n/index.svelte';

/*
 * Toutes les mises en forme suivent les préférences de l'utilisateur : lues
 * ici, dans un template ou un `$derived`, `i18n.locale` et `displayCurrency.code`
 * rendent l'affichage réactif à un changement de langue ou de devise.
 */

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return '—';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** exponent;
	return `${value < 10 && exponent > 0 ? value.toFixed(1) : Math.round(value)} ${units[exponent]}`;
}

/**
 * Formate un montant dans la devise donnée, sans conversion.
 * Sert à afficher le montant d'origine tel qu'il figure dans le sidecar.
 */
export function formatMoney(amount: number | null, currency: string = displayCurrency.code): string {
	if (amount === null || !Number.isFinite(amount)) return '—';
	// Un coût par génération est souvent une fraction de centime : on garde de la
	// précision sur les petites valeurs.
	const digits = amount !== 0 && Math.abs(amount) < 0.01 ? 4 : amount < 1 ? 3 : 2;
	try {
		return new Intl.NumberFormat(i18n.locale, {
			style: 'currency',
			currency,
			// La devise choisie par l'utilisateur n'a rien d'ambigu : « 3,27 $ »
			// plutôt que « 3,27 $US ». Toute autre devise garde son symbole
			// distinctif, car « $ » seul pourrait aussi bien être canadien.
			currencyDisplay: currency === displayCurrency.code ? 'narrowSymbol' : 'symbol',
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		}).format(amount);
	} catch {
		// Code devise inconnu d'Intl : on affiche le code brut à côté du nombre.
		return `${amount.toFixed(digits)} ${currency}`;
	}
}

/**
 * Formate un montant exprimé en euros — la devise pivot des sommes et des
 * moyennes — dans la devise d'affichage choisie.
 */
export function formatFromEur(eur: number | null): string {
	if (eur === null) return formatMoney(null);
	return formatMoney(fromEur(eur, displayCurrency.code), displayCurrency.code);
}

/**
 * Formate un coût de sidecar dans la devise d'affichage.
 *
 * Un montant déjà dans cette devise est affiché tel quel, sans aller-retour
 * par l'euro qui pourrait l'arrondir. Une devise sans taux connu est affichée
 * dans sa propre devise, plutôt que faussement convertie.
 */
export function formatCost(cost: number | null, currency?: string | null): string {
	const converted = toEur(cost, currency);
	if (!converted) return '—';
	if (converted.eur === null || converted.sourceCurrency === displayCurrency.code) {
		return formatMoney(converted.source, converted.sourceCurrency);
	}
	return formatFromEur(converted.eur);
}

export function formatDuration(seconds: number | null): string {
	if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
	if (seconds < 60) return `${seconds % 1 === 0 ? seconds : seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const rest = Math.round(seconds % 60);
	return `${minutes}min ${String(rest).padStart(2, '0')}s`;
}

export function formatDate(epochMs: number): string {
	return new Intl.DateTimeFormat(i18n.locale, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(new Date(epochMs));
}

export function formatRelative(epochMs: number): string {
	const deltaSeconds = Math.round((epochMs - Date.now()) / 1000);
	const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		['second', 60],
		['minute', 60],
		['hour', 24],
		['day', 7],
		['week', 4.35],
		['month', 12],
		['year', Infinity]
	];

	let value = deltaSeconds;
	for (const [unit, size] of steps) {
		if (Math.abs(value) < size) {
			return new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'auto' }).format(
				Math.round(value),
				unit
			);
		}
		value /= size;
	}
	return formatDate(epochMs);
}

/** Part entre 0 et 1, arrondie à l'unité (« 12 % » en français, « 12% » en anglais). */
export function formatPercent(share: number): string {
	return new Intl.NumberFormat(i18n.locale, { style: 'percent', maximumFractionDigits: 0 }).format(
		share
	);
}

export function formatDimensions(width: number | null, height: number | null): string {
	return width && height ? `${width} × ${height}` : '—';
}

/**
 * Date seule et heure seule.
 *
 * Découper la sortie de `formatDate` sur son séparateur (« à », « , »…) casse
 * dès qu'ICU change de version : mieux vaut demander à Intl exactement le champ
 * voulu.
 */
export function formatDay(epochMs: number): string {
	return new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium' }).format(new Date(epochMs));
}

export function formatTime(epochMs: number): string {
	return new Intl.DateTimeFormat(i18n.locale, { hour: '2-digit', minute: '2-digit' }).format(
		new Date(epochMs)
	);
}
