<script lang="ts">
	import { onMount } from 'svelte';
	import { spend, serviceOf } from '$lib/spend.svelte';
	import {
		formatCost,
		formatDate,
		formatDay,
		formatDuration,
		formatFromEur,
		formatPercent,
		formatRelative,
		formatTime
	} from '$lib/format';
	import { i18n } from '$lib/i18n/index.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import Preferences from '$lib/components/Preferences.svelte';
	import Rich from '$lib/components/Rich.svelte';

	const m = $derived(i18n.m);

	/** Les clés « inconnu » sont des chaînes vides : le libellé vient du dictionnaire. */
	const serviceName = (service: string) => service || m.stats.unknownService;
	const modelName = (model: string) => model || m.stats.unknownModel;

	/** Filet de sécurité identique au mur : si le canal SSE tombe, on interroge. */
	const POLL_MS = 15_000;

	/** Le journal se lit du plus récent au plus ancien, la chronologie l'inverse. */
	const journal = $derived([...spend.buckets].reverse());

	/** Hauteur d'une barre, en pourcentage du plus gros seau de la période. */
	function barHeight(eur: number): number {
		if (spend.peak <= 0) return 0;
		return Math.max(2, (eur / spend.peak) * 100);
	}

	onMount(() => {
		void spend.refresh();
		const disconnect = spend.connect();
		const poll = setInterval(() => {
			if (!spend.live) void spend.refresh();
		}, POLL_MS);

		return () => {
			clearInterval(poll);
			disconnect();
		};
	});
</script>

<svelte:head><title>{m.stats.pageTitle}</title></svelte:head>

<header class="bar">
	<div class="row">
		<div class="brand">
			<Logo live={spend.live} />
			<h1>{m.stats.title}</h1>
		</div>
		<a class="back" href="/">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6" /></svg>
			{m.stats.back}
		</a>
		<Preferences />
	</div>
</header>

<main>
	{#if spend.status === 'loading'}
		<p class="state">{m.stats.loading}</p>
	{:else if spend.status === 'error'}
		<div class="state error">
			<h2>{m.stats.errorTitle}</h2>
			<p>{spend.error}</p>
			<button type="button" onclick={() => spend.refresh()}>{m.common.retry}</button>
		</div>
	{:else if spend.entries.length === 0}
		<div class="state">
			<h2>{m.stats.emptyTitle}</h2>
			<p><Rich text={m.stats.emptyBody} /></p>
		</div>
	{:else}
		<!-- Vue d'ensemble -->
		<section class="tiles">
			<div class="tile">
				<h2>{m.stats.totalSpent}</h2>
				<p class="figure">{formatFromEur(spend.totals.eur)}</p>
				<p class="sub">
					{m.stats.generations(spend.totals.count)}
					{#if spend.totals.first}
						· {m.stats.since(formatDay(spend.totals.first))}
					{/if}
				</p>
			</div>

			<div class="tile">
				<h2>{m.stats.averageCost}</h2>
				<p class="figure">{formatFromEur(spend.totals.average)}</p>
				<p class="sub">{m.stats.averageSub}</p>
			</div>

			<div class="tile">
				<h2>{m.stats.lastSpend}</h2>
				<p class="figure small">
					{spend.totals.last ? formatRelative(spend.totals.last) : '—'}
				</p>
				<p class="sub">{spend.totals.last ? formatDate(spend.totals.last) : ''}</p>
			</div>
		</section>

		{#if spend.totals.withoutCost || spend.totals.unconvertible}
			<p class="caveat">
				{#if spend.totals.withoutCost}
					{m.stats.withoutCost(spend.totals.withoutCost)}
				{/if}
				{#if spend.totals.unconvertible}
					{m.stats.unconvertible(spend.totals.unconvertible)}
				{/if}
				{m.stats.caveatEnd}
			</p>
		{/if}

		<!-- Filtres -->
		<section class="filters">
			<div class="chips">
				{#each spend.allServices as service (service)}
					<button
						type="button"
						class="chip"
						class:on={spend.services.includes(service)}
						style:--chip={spend.colorOf(service)}
						onclick={() => spend.toggleService(service)}
					>
						<span class="dot" style:background={spend.colorOf(service)}></span>
						{serviceName(service)}
					</button>
				{/each}
			</div>
			{#if spend.services.length}
				<button type="button" class="clear" onclick={() => spend.reset()}>{m.common.reset}</button>
			{/if}
		</section>

		{#if spend.filtered.length === 0}
			<div class="state">
				<h2>{m.stats.noMatchTitle}</h2>
				<p>{m.stats.noMatchBody}</p>
				<button type="button" onclick={() => spend.reset()}>{m.stats.resetButton}</button>
			</div>
		{:else}
			<!-- Chronologie -->
			<section class="block">
				<div class="block-head">
					<h2>{m.stats.timeline}</h2>
					<span class="hint">
						{spend.granularity === 'month' ? m.stats.byMonth : m.stats.byDay} · {m.stats.oldestLeft}
					</span>
				</div>
				<div class="chart" role="img" aria-label={m.stats.chartLabel}>
					{#each spend.buckets as bucket (bucket.key)}
						<div class="col" title="{bucket.label} — {formatFromEur(bucket.eur)} ({bucket.count})">
							<div class="stack" style:height="{barHeight(bucket.eur)}%">
								{#each bucket.slices as slice (slice.service)}
									<div
										class="slice"
										style:background={slice.color}
										style:flex="{bucket.eur > 0 ? slice.eur / bucket.eur : 1 / bucket.slices.length} 0 0"
									></div>
								{/each}
							</div>
							<span class="tick">{bucket.tick}</span>
						</div>
					{/each}
				</div>
			</section>

			<!-- Par fournisseur -->
			<section class="block">
				<div class="block-head">
					<h2>{m.stats.byProvider}</h2>
					<span class="hint">{m.stats.providers(spend.byProvider.length)}</span>
				</div>
				<div class="providers">
					{#each spend.byProvider as provider (provider.service)}
						<article class="provider" style:--tint={provider.color}>
							<header>
								<span class="dot" style:background={provider.color}></span>
								<h3>{serviceName(provider.service)}</h3>
								<strong>{formatFromEur(provider.eur)}</strong>
							</header>
							<div class="share"><span style:width="{provider.share * 100}%"></span></div>
							<p class="sub">
								{m.stats.shareOfTotal(formatPercent(provider.share))} ·
								{m.stats.generations(provider.count)}
								{#if provider.deleted}· {m.stats.deleted(provider.deleted)}{/if}
							</p>
							<ul class="models">
								{#each provider.models as model (model.model)}
									<li>
										<span class="name">{modelName(model.model)}</span>
										<span class="count">×{model.count}</span>
										<span class="amount">{formatFromEur(model.eur)}</span>
									</li>
								{/each}
							</ul>
							<p class="range">
								{formatDay(provider.first)} → {formatDay(provider.last)}
								{#if provider.withoutCost}
									<em>· {m.stats.withoutCostShort(provider.withoutCost)}</em>
								{/if}
								{#if provider.unconvertible}
									<em class="warn">· {m.stats.notConverted(provider.unconvertible)}</em>
								{/if}
							</p>
						</article>
					{/each}
				</div>
			</section>

			<!-- Journal -->
			<section class="block">
				<div class="block-head">
					<h2>{m.stats.journal}</h2>
					<span class="hint">{m.stats.newestFirst}</span>
				</div>
				{#each journal as bucket (bucket.key)}
					<div class="day">
						<div class="day-head">
							<h3>{bucket.label}</h3>
							<span class="day-total">{formatFromEur(bucket.eur)}</span>
							<span class="day-count">{bucket.count}</span>
						</div>
						<ul class="rows">
							{#each bucket.entries as entry (entry.id)}
								<li class:deleted={entry.deletedAt !== null}>
									<span class="swatch" style:background={spend.colorOf(serviceOf(entry))}></span>
									<span class="time">{formatTime(entry.createdAt)}</span>
									<span class="media">
										{#if entry.url}
											<a href={entry.url} target="_blank" rel="noreferrer">{entry.name}</a>
										{:else}
											<span class="gone" title={m.stats.deletedOn(formatDate(entry.deletedAt!))}
												>{entry.name}</span
											>
										{/if}
										{#if entry.deletedAt !== null}<em class="badge">{m.stats.deletedBadge}</em>{/if}
									</span>
									<span class="who">{serviceName(serviceOf(entry))}</span>
									<span class="what">{entry.model ?? '—'}</span>
									<span class="meta">
										{entry.kind === 'video' ? formatDuration(entry.duration) : m.stats.image}
									</span>
									<span class="price">{formatCost(entry.cost, entry.currency)}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</section>
		{/if}

		<p class="ledger"><Rich text={m.stats.ledgerNote(spend.ledger)} /></p>
	{/if}

	{#if spend.warnings.length}
		<details class="warnings">
			<summary>{m.common.readWarnings(spend.warnings.length)}</summary>
			<ul>
				{#each spend.warnings as warning (warning)}
					<li>{warning}</li>
				{/each}
			</ul>
		</details>
	{/if}
</main>

<style>
	/* En-tête : même grammaire que la barre du mur (voile, flou, filet). */
	.bar {
		position: sticky;
		top: 0;
		z-index: 30;
		padding: 14px 22px;
		background: var(--bg-veil);
		backdrop-filter: blur(18px) saturate(140%);
		border-bottom: 1px solid var(--line);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		flex: 1 1 auto;
	}

	h1 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -0.015em;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 7px 12px 7px 8px;
		border-radius: var(--radius-control);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 12.5px;
		color: var(--text-dim);
		text-decoration: none;
		transition: all 0.16s ease;
	}

	.back:hover {
		color: var(--text);
		border-color: var(--line-strong);
	}

	.back svg {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	main {
		padding: 22px 22px 72px;
		max-width: 1180px;
		margin: 0 auto;
	}

	.state {
		max-width: 560px;
		margin: 12vh auto;
		text-align: center;
		color: var(--text-dim);
	}

	.state h2 {
		margin: 0 0 8px;
		font-size: 17px;
		font-weight: 600;
		color: var(--text);
	}

	.state p {
		margin: 0 0 14px;
		font-size: 13.5px;
		line-height: 1.65;
	}

	.state button {
		padding: 7px 14px;
		border-radius: var(--radius-control);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 12.5px;
		color: var(--text-dim);
		transition: all 0.16s ease;
	}

	.state button:hover {
		color: var(--text);
		border-color: var(--line-strong);
	}

	.error h2 {
		color: var(--warn);
	}

	main :global(code) {
		font-family: var(--mono);
		font-size: 11.5px;
		color: var(--text-dim);
		background: var(--surface-raised);
		padding: 1px 5px;
		border-radius: 4px;
	}

	/* Vue d'ensemble */
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 12px;
	}

	.tile {
		padding: 16px 18px;
		border-radius: var(--radius-card);
		border: 1px solid var(--line);
		background: var(--surface);
	}

	.tile h2 {
		margin: 0 0 10px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-faint);
	}

	.figure {
		margin: 0;
		font-size: 26px;
		font-weight: 600;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}

	.figure.small {
		font-size: 18px;
	}

	.sub {
		margin: 6px 0 0;
		font-size: 11.5px;
		color: var(--text-faint);
		line-height: 1.5;
	}

	.caveat {
		margin: 12px 0 0;
		font-size: 11.5px;
		color: var(--warn);
	}

	/* Filtres */
	.filters {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px 14px;
		margin-top: 22px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 5px 11px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--surface-raised);
		font-size: 12px;
		color: var(--text-dim);
		transition: all 0.16s ease;
	}

	.chip:hover {
		border-color: var(--line-strong);
		color: var(--text);
	}

	.chip.on {
		color: var(--text);
		border-color: var(--chip);
		background: color-mix(in srgb, var(--chip) 16%, transparent);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex: none;
	}

	.clear {
		font-size: 11.5px;
		color: var(--accent);
		border-bottom: 1px solid transparent;
	}

	.clear:hover {
		border-bottom-color: var(--accent-line);
	}

	/* Sections */
	.block {
		margin-top: 30px;
	}

	.block-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 12px;
	}

	.block-head h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}

	.hint {
		font-size: 11px;
		color: var(--text-faint);
	}

	/* Chronologie : barres empilées, une colonne par jour ou par mois. */
	.chart {
		display: flex;
		align-items: flex-end;
		gap: 6px;
		height: 190px;
		padding: 14px 16px 0;
		border-radius: var(--radius-card);
		border: 1px solid var(--line);
		background: var(--surface);
		overflow-x: auto;
	}

	.col {
		/* Bornée : deux jours de dépenses ne doivent pas produire deux aplats de
		   couleur larges comme la page. */
		flex: 1 1 22px;
		min-width: 22px;
		max-width: 72px;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 8px;
	}

	.stack {
		display: flex;
		flex-direction: column-reverse;
		border-radius: 5px;
		overflow: hidden;
		min-height: 3px;
		/* Une dépense nulle reste visible : une barre absente et une barre à zéro
		   ne racontent pas la même chose. */
		background: var(--surface-raised);
		transition: opacity 0.16s ease;
	}

	.col:hover .stack {
		opacity: 0.82;
	}

	.slice {
		min-height: 2px;
	}

	.tick {
		flex: none;
		font-size: 9.5px;
		color: var(--text-faint);
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-bottom: 10px;
	}

	/* Fournisseurs */
	.providers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 12px;
	}

	.provider {
		padding: 15px 17px;
		border-radius: var(--radius-card);
		border: 1px solid var(--line);
		background: var(--surface);
	}

	.provider header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.provider h3 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		flex: 1 1 auto;
		overflow-wrap: anywhere;
	}

	.provider strong {
		font-size: 14px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.share {
		height: 4px;
		margin: 11px 0 9px;
		border-radius: 999px;
		background: var(--surface-raised);
		overflow: hidden;
	}

	.share span {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--tint);
	}

	.models {
		list-style: none;
		margin: 12px 0 0;
		padding: 11px 0 0;
		border-top: 1px solid var(--line);
		display: grid;
		gap: 6px;
	}

	.models li {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 11.5px;
		color: var(--text-dim);
	}

	.models .name {
		flex: 1 1 auto;
		overflow-wrap: anywhere;
	}

	.models .count,
	.models .amount {
		flex: none;
		font-family: var(--mono);
		font-size: 10.5px;
		color: var(--text-faint);
	}

	.models .amount {
		color: var(--text-dim);
	}

	.range {
		margin: 11px 0 0;
		font-size: 10.5px;
		color: var(--text-faint);
	}

	.range em {
		font-style: normal;
	}

	.range em.warn {
		color: var(--warn);
	}

	/* Journal */
	.day + .day {
		margin-top: 18px;
	}

	.day-head {
		display: flex;
		align-items: baseline;
		gap: 9px;
		padding-bottom: 7px;
		border-bottom: 1px solid var(--line);
	}

	.day-head h3 {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-dim);
		flex: 1 1 auto;
	}

	/* `capitalize` majusculerait chaque mot (« Lun. 31 Août ») : seule la
	   première lettre du libellé doit changer. */
	.day-head h3::first-letter {
		text-transform: uppercase;
	}

	.day-total {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	.day-count {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--text-faint);
		border: 1px solid var(--line);
		border-radius: 5px;
		padding: 0 5px;
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.rows li {
		display: grid;
		grid-template-columns: 8px 42px minmax(140px, 2fr) minmax(90px, 1fr) minmax(90px, 1fr) 62px 78px;
		align-items: center;
		gap: 10px;
		padding: 8px 4px;
		border-bottom: 1px solid var(--line);
		font-size: 12px;
	}

	.rows li:hover {
		background: var(--surface);
	}

	.swatch {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}

	.time,
	.meta {
		font-family: var(--mono);
		font-size: 10.5px;
		color: var(--text-faint);
	}

	.media {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}

	.media a,
	.media .gone {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
		text-decoration: none;
		border-bottom: 1px solid transparent;
	}

	.media a:hover {
		border-bottom-color: var(--line-strong);
	}

	.media .gone {
		color: var(--text-faint);
		text-decoration: line-through;
		text-decoration-color: var(--line-strong);
	}

	.badge {
		flex: none;
		font-style: normal;
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--danger);
		background: var(--danger-soft);
		border: 1px solid var(--danger-line);
		border-radius: 999px;
		padding: 1px 6px;
	}

	.who,
	.what {
		color: var(--text-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.what {
		color: var(--text-faint);
	}

	.price {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.ledger {
		margin: 34px 0 0;
		font-size: 11px;
		color: var(--text-faint);
	}

	.ledger :global(code) {
		overflow-wrap: anywhere;
	}

	.warnings {
		margin: 26px 0 0;
		font-size: 12px;
		color: var(--text-faint);
	}

	.warnings summary {
		cursor: pointer;
		color: var(--warn);
	}

	.warnings ul {
		margin: 8px 0 0;
		padding-left: 18px;
		line-height: 1.7;
	}

	@media (max-width: 860px) {
		main {
			padding: 18px 14px 60px;
		}

		.bar {
			padding: 12px 14px;
		}

		/* Le journal passe en deux lignes : le prix reste à droite du nom. */
		.rows li {
			grid-template-columns: 8px 42px 1fr 78px;
			grid-template-areas:
				'swatch time media price'
				'. . who who';
			row-gap: 3px;
		}

		.swatch {
			grid-area: swatch;
		}
		.time {
			grid-area: time;
		}
		.media {
			grid-area: media;
		}
		.price {
			grid-area: price;
		}
		.who {
			grid-area: who;
			font-size: 11px;
		}
		.what,
		.meta {
			display: none;
		}
	}
</style>
