<script lang="ts">
	import { i18n, LOCALES, type Locale } from '$lib/i18n/index.svelte';
	import { displayCurrency } from '$lib/display-currency.svelte';
	import { DISPLAY_CURRENCIES, type DisplayCurrency } from '$lib/currency';

	/**
	 * Préférences d'affichage, présentes dans l'en-tête de chaque page : langue
	 * de l'interface et devise des montants. Les deux sont indépendantes — et
	 * aucune ne touche aux données des sidecars.
	 */

	/** Symbole court (« $ » plutôt que « US$ ») : le code suit juste après. */
	function symbolOf(code: string): string {
		const parts = new Intl.NumberFormat(i18n.locale, {
			style: 'currency',
			currency: code,
			currencyDisplay: 'narrowSymbol'
		}).formatToParts(0);
		return parts.find((part) => part.type === 'currency')?.value ?? code;
	}

	/** Nom complet de la devise dans la langue de l'interface, en info-bulle. */
	const currencyNames = $derived(new Intl.DisplayNames(i18n.locale, { type: 'currency' }));
</script>

<div class="preferences">
	<label class="picker" title={i18n.m.language.label}>
		<svg viewBox="0 0 24 24" aria-hidden="true"
			><circle cx="12" cy="12" r="9" /><path
				d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"
			/></svg
		>
		<span class="sr">{i18n.m.language.label}</span>
		<!-- Chaque langue est nommée dans sa propre langue : on retrouve la sienne
			 même quand l'interface est dans une langue qu'on ne lit pas. -->
		<select value={i18n.locale} onchange={(event) => i18n.set(event.currentTarget.value as Locale)}>
			{#each LOCALES as locale (locale.code)}
				<option value={locale.code} lang={locale.code}>{locale.name}</option>
			{/each}
		</select>
	</label>

	<label class="picker plain" title={currencyNames.of(displayCurrency.code) ?? i18n.m.currency.label}>
		<span class="sr">{i18n.m.currency.label}</span>
		<select
			value={displayCurrency.code}
			onchange={(event) => displayCurrency.set(event.currentTarget.value as DisplayCurrency)}
		>
			{#each DISPLAY_CURRENCIES as code (code)}
				<option value={code} title={currencyNames.of(code)}>{symbolOf(code)} {code}</option>
			{/each}
		</select>
	</label>
</div>

<style>
	.preferences {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: none;
	}

	.picker {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	svg {
		position: absolute;
		left: 9px;
		width: 14px;
		height: 14px;
		fill: none;
		stroke: var(--text-faint);
		stroke-width: 1.6;
		pointer-events: none;
	}

	select {
		appearance: none;
		padding: 7px 26px 7px 29px;
		border-radius: var(--radius-control);
		border: 1px solid var(--line);
		background: var(--surface);
		background-image: linear-gradient(45deg, transparent 50%, var(--text-faint) 50%),
			linear-gradient(135deg, var(--text-faint) 50%, transparent 50%);
		background-position: calc(100% - 14px) 52%, calc(100% - 9px) 52%;
		background-size: 5px 5px;
		background-repeat: no-repeat;
		font-size: 12.5px;
		color: var(--text-dim);
		transition: all 0.16s ease;
	}

	/* Sans icône : le symbole monétaire en tête d'option en tient lieu. */
	.plain select {
		padding-left: 11px;
		font-variant-numeric: tabular-nums;
	}

	select:hover {
		color: var(--text);
		border-color: var(--line-strong);
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
