<script lang="ts">
	import type { GenerationItem } from '$lib/types';
	import { gallery } from '$lib/gallery.svelte';
	import {
		formatBytes,
		formatCost,
		formatDate,
		formatDimensions,
		formatDuration,
		formatMoney,
		formatRelative
	} from '$lib/format';
	import { toEur } from '$lib/currency';
	import { displayCurrency } from '$lib/display-currency.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import ClampedText from './ClampedText.svelte';

	interface Props {
		item: GenerationItem;
	}

	let { item }: Props = $props();

	const m = $derived(i18n.m);

	/** Phrase traduite si le serveur a donné un code connu, message brut sinon. */
	const deleteError = $derived(
		gallery.deleteError &&
			m.lightbox.deleteFailed(
				gallery.deleteError.code
					? m.lightbox.deleteErrors[gallery.deleteError.code]
					: gallery.deleteError.message
			)
	);

	let panel = $state<HTMLElement | null>(null);
	let copied = $state<string | null>(null);
	let confirmingDelete = $state(false);

	/** Champs rendus explicitement ci-dessous ; le reste passe en « extras ». */
	const KNOWN_KEYS = new Set([
		'prompt',
		'description',
		'text',
		'negative_prompt',
		'model',
		'model_name',
		'service',
		'provider',
		'platform',
		'width',
		'w',
		'height',
		'h',
		'size',
		'resolution',
		'dimensions',
		'duration',
		'duration_seconds',
		'length',
		'cost',
		'estimated_cost',
		'price',
		'currency',
		'created_at',
		'createdAt',
		'date',
		'timestamp',
		'seed',
		'tags',
		'labels',
		'notes',
		'note',
		'comment',
		'poster',
		'thumbnail',
		'thumb'
	]);

	const extras = $derived(
		Object.entries(item.meta)
			.filter(([key, value]) => !KNOWN_KEYS.has(key) && value !== null && value !== '')
			.map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)])
	);

	const position = $derived(`${gallery.selectedIndex + 1} / ${gallery.filtered.length}`);

	/** Coût ramené à l'euro pivot, avec le montant facturé d'origine. */
	const cost = $derived(toEur(item.cost, item.currency));

	/** Le montant d'origine n'est rappelé que s'il a réellement été converti. */
	const converted = $derived(
		cost !== null && cost.eur !== null && cost.sourceCurrency !== displayCurrency.code
	);

	$effect(() => {
		// Redonne le focus dès que le lightbox passe à un autre élément, et annule
		// une confirmation de suppression restée ouverte sur l'élément précédent.
		void item.id;
		confirmingDelete = false;
		panel?.focus();
	});

	$effect(() => {
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	function close() {
		gallery.select(null);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			// Échap annule d'abord la suppression en attente, sans fermer la vue.
			if (confirmingDelete) confirmingDelete = false;
			else close();
		} else if (event.key === 'ArrowRight') {
			gallery.step(1);
		} else if (event.key === 'ArrowLeft') {
			gallery.step(-1);
		}
	}

	async function copy(label: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copied = label;
			setTimeout(() => (copied = copied === label ? null : copied), 1400);
		} catch {
			copied = null;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Le voile est une surface de fermeture au clic ; Échap et le bouton de
	 fermeture couvrent le clavier, il ne porte donc aucun rôle interactif. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onclick={(event) => event.target === event.currentTarget && close()}>
	<div
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-label={m.lightbox.dialogLabel}
		tabindex="-1"
		bind:this={panel}
	>
		<figure class="stage">
			{#key item.id}
				{#if item.kind === 'video'}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video src={item.url} poster={item.posterUrl ?? undefined} controls autoplay muted loop playsinline
					></video>
				{:else}
					<img src={item.url} alt={item.prompt || item.name} />
				{/if}
			{/key}

			{#if gallery.filtered.length > 1}
				<button class="nav prev" type="button" onclick={() => gallery.step(-1)} aria-label={m.lightbox.previous}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
				</button>
				<button class="nav next" type="button" onclick={() => gallery.step(1)} aria-label={m.lightbox.next}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
				</button>
			{/if}
		</figure>

		<aside class="meta">
			<header>
				<span class="counter">{position}</span>
				<button class="close" type="button" onclick={close} aria-label={m.lightbox.close}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
				</button>
			</header>

			<section class="prompt-block">
				<div class="section-head">
					<h2>{m.lightbox.prompt}</h2>
					{#if item.prompt}
						<button type="button" class="ghost" onclick={() => copy('prompt', item.prompt)}>
							{copied === 'prompt' ? m.common.copied : m.common.copy}
						</button>
					{/if}
				</div>
				{#if item.prompt}
					<!-- Recréé à chaque média : on repart toujours replié, même quand
						 deux générations voisines partagent le même prompt. -->
					{#key item.id}
						<ClampedText text={item.prompt} />
					{/key}
				{:else}
					<p class="prompt empty">{m.lightbox.noPrompt}</p>
				{/if}
				{#if item.meta.negative_prompt}
					<h3>{m.lightbox.negativePrompt}</h3>
					<p class="prompt negative">{item.meta.negative_prompt}</p>
				{/if}
			</section>

			<dl class="facts">
				<div><dt>{m.lightbox.model}</dt><dd>{item.model ?? '—'}</dd></div>
				<div><dt>{m.lightbox.service}</dt><dd>{item.service ?? '—'}</dd></div>
				<div>
					<dt>{m.lightbox.type}</dt>
					<dd>{item.kind === 'video' ? m.lightbox.video : m.lightbox.image} · {item.ext}</dd>
				</div>
				<div><dt>{m.lightbox.dimensions}</dt><dd>{formatDimensions(item.width, item.height)}</dd></div>
				{#if item.kind === 'video'}
					<div><dt>{m.lightbox.duration}</dt><dd>{formatDuration(item.duration)}</dd></div>
				{/if}
				<div><dt>{m.lightbox.size}</dt><dd>{formatBytes(item.bytes)}</dd></div>
				<div>
					<dt>{m.lightbox.cost}</dt>
					<dd class="cost">
						{formatCost(item.cost, item.currency)}
						{#if converted && cost}
							<span class="source-amount" title={m.lightbox.convertedTitle}>
								{m.lightbox.convertedFrom(formatMoney(cost.source, cost.sourceCurrency))}
							</span>
						{:else if cost && cost.eur === null}
							<span class="source-amount warn-text">
								{m.lightbox.noRate(cost.sourceCurrency)}
							</span>
						{/if}
					</dd>
				</div>
				<div>
					<dt>{m.lightbox.date}</dt>
					<dd><span title={formatDate(item.createdAt)}>{formatRelative(item.createdAt)}</span></dd>
				</div>
				{#if item.seed}
					<div><dt>{m.lightbox.seed}</dt><dd class="mono">{item.seed}</dd></div>
				{/if}
			</dl>

			{#if item.tags.length}
				<section>
					<h2>{m.lightbox.tags}</h2>
					<div class="tags">
						{#each item.tags as tag (tag)}
							<button
								type="button"
								class="tag"
								onclick={() => {
									if (!gallery.tags.includes(tag)) gallery.toggleTag(tag);
									close();
								}}>{tag}</button
							>
						{/each}
					</div>
				</section>
			{/if}

			{#if item.notes}
				<section>
					<h2>{m.lightbox.notes}</h2>
					{#key item.id}
						<ClampedText text={item.notes} lines={5} />
					{/key}
				</section>
			{/if}

			{#if extras.length}
				<section>
					<h2>{m.lightbox.extras}</h2>
					<dl class="facts extra">
						{#each extras as [key, value] (key)}
							<!-- Un `_` n'est pas un point de coupure : on en ajoute un après
								 chacun, pour qu'une clé longue passe à la ligne entre ses mots. -->
							<div>
								<dt>{#each key.split('_') as part, i (i)}{#if i}_<wbr />{/if}{part}{/each}</dt>
								<dd class="mono">{value}</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/if}

			<section class="file">
				<h2>{m.lightbox.file}</h2>
				<button type="button" class="path" onclick={() => copy('path', item.file)} title={m.lightbox.copyPath}>
					<span class="mono">generations/{item.file}</span>
					<em>{copied === 'path' ? m.common.copied : m.common.copy}</em>
				</button>
				{#if item.sidecar}
					<p class="sidecar mono">↳ {item.sidecar}</p>
				{:else}
					<p class="sidecar warn">{m.lightbox.noSidecar}</p>
				{/if}
				{#if item.metaError}
					<p class="sidecar warn">{m.lightbox.badSidecar(item.metaError)}</p>
				{/if}
				<a class="open" href={item.url} target="_blank" rel="noreferrer">{m.lightbox.openRaw}</a>

				<div class="danger-zone">
					{#if confirmingDelete}
						<p class="danger-question">{m.lightbox.confirmDelete(item.sidecar !== null)}</p>
						<div class="danger-actions">
							<button
								type="button"
								class="danger"
								disabled={gallery.deleting === item.id}
								onclick={() => gallery.remove(item.id)}
							>
								{gallery.deleting === item.id ? m.lightbox.deleting : m.lightbox.delete}
							</button>
							<button type="button" class="ghost" onclick={() => (confirmingDelete = false)}>
								{m.lightbox.cancel}
							</button>
						</div>
					{:else}
						<button type="button" class="danger-trigger" onclick={() => (confirmingDelete = true)}>
							<svg viewBox="0 0 24 24" aria-hidden="true"
								><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg
							>
							{m.lightbox.deleteTrigger}
						</button>
					{/if}

					{#if deleteError}
						<p class="sidecar warn" title={gallery.deleteError?.message}>{deleteError}</p>
					{/if}
				</div>
			</section>
		</aside>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: grid;
		place-items: center;
		padding: 28px;
		background: rgba(4, 4, 6, 0.82);
		backdrop-filter: blur(10px);
		animation: fade 0.18s ease;
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	.panel {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 372px;
		/* Ligne explicite : une piste implicite `auto` se dimensionnerait sur le
		   contenu avant que `max-height` ne rogne le conteneur, et le panneau de
		   métadonnées déborderait au lieu de défiler. */
		grid-template-rows: minmax(0, 1fr);
		gap: 0;
		width: min(1500px, 100%);
		/* `100%` se résoudrait contre une piste de grille dimensionnée par le
		   contenu, donc ne contraindrait rien : on s'ancre au viewport, en
		   retirant les 28px de marge du voile de chaque côté. */
		max-height: calc(100vh - 56px);
		max-height: calc(100dvh - 56px);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 20px;
		overflow: hidden;
		box-shadow: var(--shadow-pop);
		animation: rise 0.22s cubic-bezier(0.22, 1, 0.36, 1);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.985);
		}
	}

	.stage {
		position: relative;
		margin: 0;
		display: grid;
		place-items: center;
		background: #050507;
		padding: 18px;
		min-height: 0;
	}

	.stage :is(img, video) {
		max-width: 100%;
		max-height: calc(100vh - 92px);
		width: auto;
		height: auto;
		object-fit: contain;
		border-radius: 8px;
		display: block;
	}

	.nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: rgba(10, 10, 14, 0.7);
		border: 1px solid var(--line);
		backdrop-filter: blur(8px);
		opacity: 0;
		transition: opacity 0.2s ease, background 0.2s ease;
	}

	.stage:hover .nav,
	.nav:focus-visible {
		opacity: 1;
	}

	.nav:hover {
		background: var(--accent);
	}

	.nav.prev {
		left: 14px;
	}
	.nav.next {
		right: 14px;
	}

	.nav svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.meta {
		border-left: 1px solid var(--line);
		background: var(--surface);
		overflow-y: auto;
		/* Sans ça, l'élément de grille refuse de descendre sous la taille de son
		   contenu : le panneau déborde du viewport au lieu de défiler. */
		min-height: 0;
		padding: 0 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.meta header {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 0 10px;
		background: linear-gradient(var(--surface) 72%, transparent);
	}

	.counter {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--text-faint);
	}

	.close {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		border: 1px solid var(--line);
		color: var(--text-dim);
		transition: all 0.16s ease;
	}

	.close:hover {
		color: var(--text);
		border-color: var(--line-strong);
		background: var(--surface-raised);
	}

	.close svg {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
	}

	h2 {
		margin: 0;
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.11em;
		color: var(--text-faint);
	}

	h3 {
		margin: 14px 0 4px;
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.11em;
		color: var(--text-faint);
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 8px;
	}

	.ghost {
		font-size: 11px;
		color: var(--text-faint);
		padding: 2px 7px;
		border-radius: 6px;
		border: 1px solid var(--line);
		transition: all 0.16s ease;
	}

	.ghost:hover {
		color: var(--text);
		border-color: var(--line-strong);
	}

	.prompt {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.6;
		color: var(--text);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.prompt.empty,
	.prompt.negative {
		color: var(--text-dim);
		font-size: 12.5px;
	}

	.facts {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0;
		margin: 0;
		border-top: 1px solid var(--line);
	}

	.facts > div {
		display: grid;
		grid-template-columns: 108px minmax(0, 1fr);
		gap: 10px;
		padding: 7px 0;
		border-bottom: 1px solid var(--line);
	}

	dt {
		font-size: 12px;
		color: var(--text-faint);
		/* La colonne est de largeur fixe : un mot trop long est coupé plutôt que
		   de déborder sous la valeur voisine. */
		overflow-wrap: anywhere;
	}

	dd {
		margin: 0;
		font-size: 12.5px;
		overflow-wrap: anywhere;
	}

	dd.cost {
		color: var(--mint);
		font-family: var(--mono);
	}

	.source-amount {
		display: block;
		margin-top: 2px;
		font-family: var(--font);
		font-size: 11px;
		color: var(--text-faint);
	}

	.source-amount.warn-text {
		color: var(--warn);
	}

	.mono {
		font-family: var(--mono);
		font-size: 11.5px;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}

	.tag {
		font-size: 11.5px;
		padding: 3px 9px;
		border-radius: 999px;
		border: 1px solid var(--accent-line);
		background: var(--accent-soft);
		color: #cdc0ff;
		transition: background 0.16s ease;
	}

	.tag:hover {
		background: rgba(139, 108, 255, 0.3);
	}

	.file {
		margin-top: auto;
	}

	.path {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		text-align: left;
		margin-top: 8px;
		padding: 8px 10px;
		border-radius: var(--radius-control);
		border: 1px solid var(--line);
		background: var(--surface-raised);
		color: var(--text-dim);
		overflow-wrap: anywhere;
	}

	.path em {
		font-style: normal;
		font-size: 10.5px;
		color: var(--text-faint);
		flex: none;
	}

	.path:hover {
		border-color: var(--line-strong);
		color: var(--text);
	}

	.sidecar {
		margin: 6px 0 0;
		color: var(--text-faint);
		font-size: 11.5px;
	}

	.sidecar.warn {
		color: var(--warn);
		font-family: var(--font);
	}

	.open {
		display: inline-block;
		margin-top: 10px;
		font-size: 12px;
		color: var(--text-dim);
		text-decoration: none;
		border-bottom: 1px solid var(--line-strong);
	}

	.open:hover {
		color: var(--text);
	}

	.danger-zone {
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--line);
	}

	.danger-trigger {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 6px 11px;
		border-radius: var(--radius-control);
		border: 1px solid var(--line);
		font-size: 12.5px;
		color: var(--text-faint);
		transition: all 0.16s ease;
	}

	.danger-trigger:hover {
		color: var(--danger);
		border-color: var(--danger-line);
		background: var(--danger-soft);
	}

	.danger-trigger svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.danger-question {
		margin: 0 0 10px;
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--text-dim);
	}

	.danger-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.danger {
		padding: 6px 13px;
		border-radius: var(--radius-control);
		border: 1px solid var(--danger-line);
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 12.5px;
		font-weight: 500;
		transition: all 0.16s ease;
	}

	.danger:hover:not(:disabled) {
		background: var(--danger);
		border-color: var(--danger);
		color: #1a0508;
	}

	.danger:disabled {
		opacity: 0.55;
		cursor: progress;
	}

	@media (max-width: 1000px) {
		.scrim {
			padding: 0;
		}

		.panel {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr) auto;
			border-radius: 0;
			height: 100vh;
			height: 100dvh;
			max-height: 100vh;
			max-height: 100dvh;
		}

		.meta {
			border-left: none;
			border-top: 1px solid var(--line);
			max-height: 46vh;
		}

		.stage :is(img, video) {
			max-height: 100%;
		}

		.nav {
			opacity: 1;
		}
	}
</style>
