import { DISPLAY_CURRENCY, toEur } from './currency';

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
export function formatMoney(amount: number | null, currency = DISPLAY_CURRENCY): string {
	if (amount === null || !Number.isFinite(amount)) return '—';
	// Un coût par génération est souvent une fraction de centime : on garde de la
	// précision sur les petites valeurs.
	const digits = amount !== 0 && Math.abs(amount) < 0.01 ? 4 : amount < 1 ? 3 : 2;
	try {
		return new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency,
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		}).format(amount);
	} catch {
		// Code devise inconnu d'Intl : on affiche le code brut à côté du nombre.
		return `${amount.toFixed(digits)} ${currency}`;
	}
}

/** Formate un montant déjà exprimé en euros. */
export function formatEur(amount: number | null): string {
	return formatMoney(amount, DISPLAY_CURRENCY);
}

/**
 * Convertit puis formate un coût en euros. Une devise sans taux connu est
 * affichée telle quelle, dans sa propre devise, plutôt que faussement convertie.
 */
export function formatCost(cost: number | null, currency?: string | null): string {
	const converted = toEur(cost, currency);
	if (!converted) return '—';
	if (converted.eur === null) return formatMoney(converted.source, converted.sourceCurrency);
	return formatEur(converted.eur);
}

export function formatDuration(seconds: number | null): string {
	if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
	if (seconds < 60) return `${seconds % 1 === 0 ? seconds : seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const rest = Math.round(seconds % 60);
	return `${minutes}min ${String(rest).padStart(2, '0')}s`;
}

export function formatDate(epochMs: number): string {
	return new Intl.DateTimeFormat('fr-FR', {
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
			return new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' }).format(
				Math.round(value),
				unit
			);
		}
		value /= size;
	}
	return formatDate(epochMs);
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
	return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(epochMs));
}

export function formatTime(epochMs: number): string {
	return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(
		new Date(epochMs)
	);
}
