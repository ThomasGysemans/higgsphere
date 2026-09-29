<script lang="ts">
	import { gallery, SORT_LABELS, type SortKey } from '$lib/gallery.svelte';
	import { formatBytes, formatEur } from '$lib/format';
	import Logo from '$lib/components/Logo.svelte';

	let open = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	const sortKeys = Object.keys(SORT_LABELS) as SortKey[];

	const hasFacets = $derived(
		gallery.facets.models.length + gallery.facets.services.length + gallery.facets.tags.length > 0
	);

	function onWindowKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

		// « / » et ⌘K sautent au champ de recherche, comme dans les outils orientés recherche.
		if ((event.key === '/' && !typing) || ((event.metaKey || event.ctrlKey) && event.key === 'k')) {
			event.preventDefault();
			input?.focus();
			input?.select();
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<header class="bar">
	<div class="row">
		<div class="brand">
			<Logo live={gallery.live} />
			<h1>higgsphere</h1>
		</div>

		<div class="search">
			<svg viewBox="0 0 24 24" aria-hidden="true"
				><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg
			>
			<input
				bind:this={input}
				bind:value={gallery.query}
				type="search"
				placeholder="Rechercher un prompt, un modèle, un tag…"
				aria-label="Rechercher"
				spellcheck="false"
				onkeydown={(event) => {
					if (event.key === 'Escape') {
						gallery.query = '';
						input?.blur();
					}
				}}
			/>
			<kbd>/</kbd>
		</div>

		<div class="controls">
			<label class="select">
				<span class="sr">Trier par</span>
				<select bind:value={gallery.sort}>
					{#each sortKeys as key (key)}
						<option value={key}>{SORT_LABELS[key]}</option>
					{/each}
				</select>
			</label>

			<button
				type="button"
				class="toggle"
				class:active={open || gallery.activeFilterCount > 0}
				onclick={() => (open = !open)}
				aria-expanded={open}
			>
				Filtres
				{#if gallery.activeFilterCount > 0}
					<span class="count">{gallery.activeFilterCount}</span>
				{/if}
			</button>
		</div>

		<a class="nav" href="/stats" title="Dépenses par fournisseur">
			<svg viewBox="0 0 24 24" aria-hidden="true"
				><path d="M4 19V11M10 19V5M16 19v-6M22 19H2" /></svg
			>
			Dépenses
		</a>
	</div>

	{#if open}
		<div class="panel">
			<div class="group">
				<h2>Type</h2>
				<div class="chips">
					{#each ['image', 'video'] as const as kind (kind)}
						<button
							type="button"
							class="chip"
							class:on={gallery.kinds.includes(kind)}
							onclick={() => gallery.toggleKind(kind)}
						>
							{kind === 'video' ? 'Vidéos' : 'Images'}
							<em>{gallery.items.filter((item) => item.kind === kind).length}</em>
						</button>
					{/each}
				</div>
			</div>

			{#if gallery.facets.models.length}
				<div class="group">
					<h2>Modèle</h2>
					<div class="chips">
						{#each gallery.facets.models as model (model)}
							<button
								type="button"
								class="chip"
								class:on={gallery.models.includes(model)}
								onclick={() => gallery.toggleModel(model)}
							>
								{model}
								<em>{gallery.items.filter((item) => item.model === model).length}</em>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if gallery.facets.services.length}
				<div class="group">
					<h2>Service</h2>
					<div class="chips">
						{#each gallery.facets.services as service (service)}
							<button
								type="button"
								class="chip"
								class:on={gallery.services.includes(service)}
								onclick={() => gallery.toggleService(service)}
							>
								{service}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if gallery.facets.tags.length}
				<div class="group">
					<h2>Tags</h2>
					<div class="chips">
						{#each gallery.facets.tags as tag (tag)}
							<button
								type="button"
								class="chip"
								class:on={gallery.tags.includes(tag)}
								onclick={() => gallery.toggleTag(tag)}
							>
								{tag}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if !hasFacets}
				<p class="hint">
					Ajoutez des sidecars <code>.json</code> à côté de vos fichiers pour filtrer par modèle, service
					ou tag.
				</p>
			{/if}
		</div>
	{/if}

	<div class="stats">
		<span
			><strong>{gallery.filtered.length}</strong>
			{gallery.filtered.length === gallery.items.length
				? 'générations'
				: `sur ${gallery.items.length}`}</span
		>
		{#if gallery.filtered.length > 0}
			<span class="dot">·</span>
			<span
				title={gallery.unconvertibleCount
					? `${gallery.unconvertibleCount} montant(s) exclu(s) du total : devise sans taux de conversion`
					: 'Total converti en euros'}
			>
				{formatEur(gallery.visibleCost)}{#if gallery.unconvertibleCount}<em class="incomplete"
						>+{gallery.unconvertibleCount} non converti(s)</em
					>{/if}
			</span>
			<span class="dot">·</span>
			<span>{formatBytes(gallery.visibleBytes)}</span>
		{/if}
		{#if gallery.activeFilterCount > 0}
			<button type="button" class="clear" onclick={() => gallery.resetFilters()}
				>réinitialiser</button
			>
		{/if}
	</div>
</header>

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 30;
		padding: 14px 22px 10px;
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
		flex: none;
	}

	h1 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -0.015em;
	}

	.search {
		position: relative;
		flex: 1 1 auto;
		max-width: 640px;
		display: flex;
		align-items: center;
	}

	.search svg {
		position: absolute;
		left: 11px;
		width: 15px;
		height: 15px;
		fill: none;
		stroke: var(--text-faint);
		stroke-width: 1.8;
		stroke-linecap: round;
		pointer-events: none;
	}

	.search input {
		width: 100%;
		padding: 8px 40px 8px 34px;
		border-radius: var(--radius-control);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 13px;
		transition: border-color 0.16s ease, background 0.16s ease;
	}

	.search input::placeholder {
		color: var(--text-faint);
	}

	.search input:focus {
		outline: none;
		border-color: var(--accent-line);
		background: var(--surface-raised);
	}

	.search input::-webkit-search-cancel-button {
		appearance: none;
	}

	kbd {
		position: absolute;
		right: 10px;
		font-family: var(--mono);
		font-size: 10px;
		color: var(--text-faint);
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 1px 5px;
		pointer-events: none;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: none;
	}

	.select select,
	.toggle,
	.nav {
		padding: 7px 11px;
		border-radius: var(--radius-control);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 12.5px;
		color: var(--text-dim);
		transition: all 0.16s ease;
	}

	.select select {
		appearance: none;
		padding-right: 26px;
		background-image: linear-gradient(45deg, transparent 50%, var(--text-faint) 50%),
			linear-gradient(135deg, var(--text-faint) 50%, transparent 50%);
		background-position: calc(100% - 14px) 52%, calc(100% - 9px) 52%;
		background-size: 5px 5px;
		background-repeat: no-repeat;
	}

	.select select:hover,
	.toggle:hover,
	.nav:hover {
		color: var(--text);
		border-color: var(--line-strong);
	}

	.nav {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		text-decoration: none;
		flex: none;
		/* Tri et filtres appartiennent à la recherche ; la page des dépenses est
		   une destination à part, isolée au bord droit de la barre. */
		margin-left: auto;
	}

	.nav svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}

	.toggle.active {
		color: var(--text);
		border-color: var(--accent-line);
		background: var(--accent-soft);
	}

	.count {
		font-family: var(--mono);
		font-size: 10px;
		min-width: 16px;
		height: 16px;
		display: grid;
		place-items: center;
		border-radius: 5px;
		background: var(--accent);
		color: #0b0718;
		font-weight: 600;
	}

	.panel {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 16px 26px;
		margin-top: 14px;
		padding: 14px 16px;
		border-radius: 14px;
		border: 1px solid var(--line);
		background: var(--surface);
	}

	.group h2 {
		margin: 0 0 8px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-faint);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
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
		background: var(--accent-soft);
		border-color: var(--accent-line);
		color: #d3c8ff;
	}

	.chip em {
		font-family: var(--mono);
		font-style: normal;
		font-size: 10px;
		color: var(--text-faint);
	}

	.hint {
		margin: 0;
		font-size: 12.5px;
		color: var(--text-faint);
	}

	.hint code {
		font-family: var(--mono);
		font-size: 11.5px;
		color: var(--text-dim);
	}

	.stats {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-top: 10px;
		font-size: 11.5px;
		color: var(--text-faint);
	}

	.stats strong {
		color: var(--text-dim);
		font-weight: 600;
	}

	.dot {
		opacity: 0.5;
	}

	.incomplete {
		margin-left: 5px;
		font-style: normal;
		color: var(--warn);
	}

	.clear {
		margin-left: 4px;
		font-size: 11.5px;
		color: var(--accent);
		border-bottom: 1px solid transparent;
	}

	.clear:hover {
		border-bottom-color: var(--accent-line);
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	@media (max-width: 720px) {
		.bar {
			padding: 12px 14px 8px;
		}

		.row {
			flex-wrap: wrap;
			gap: 10px;
		}

		.search {
			order: 3;
			max-width: none;
			flex-basis: 100%;
		}

		kbd {
			display: none;
		}
	}
</style>
