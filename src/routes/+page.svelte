<script lang="ts">
	import { onMount } from 'svelte';
	import { gallery } from '$lib/gallery.svelte';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import Masonry from '$lib/components/Masonry.svelte';
	import Lightbox from '$lib/components/Lightbox.svelte';

	/** Filet de sécurité : si le canal SSE tombe, on se rabat sur du polling. */
	const POLL_MS = 15_000;

	onMount(() => {
		void gallery.refresh();
		const disconnect = gallery.connect();
		const poll = setInterval(() => {
			if (!gallery.live) void gallery.refresh();
		}, POLL_MS);

		return () => {
			clearInterval(poll);
			disconnect();
		};
	});
</script>

<FilterPanel />

<main>
	{#if gallery.status === 'loading'}
		<p class="state">Lecture du dossier <code>generations/</code>…</p>
	{:else if gallery.status === 'error'}
		<div class="state error">
			<h2>Impossible de lire l'index</h2>
			<p>{gallery.error}</p>
			<button type="button" onclick={() => gallery.refresh()}>Réessayer</button>
		</div>
	{:else if gallery.items.length === 0}
		<div class="state onboarding">
			<h2>Le mur est vide</h2>
			<p>
				Déposez vos images et vidéos générées dans <code>generations/</code>, avec un fichier
				<code>.json</code> du même nom à côté. Elles apparaîtront ici sans rechargement.
			</p>
			<pre><code>{`generations/
  2026-08-31-nebula.png
  2026-08-31-nebula.json`}</code></pre>
			{#if gallery.root}
				<p class="path">{gallery.root}</p>
			{/if}
		</div>
	{:else if gallery.filtered.length === 0}
		<div class="state">
			<h2>Aucun résultat</h2>
			<p>Aucune génération ne correspond à cette recherche.</p>
			<button type="button" onclick={() => gallery.resetFilters()}>Réinitialiser les filtres</button>
		</div>
	{:else}
		<Masonry items={gallery.filtered} />
	{/if}

	{#if gallery.warnings.length}
		<details class="warnings">
			<summary>{gallery.warnings.length} avertissement(s) de lecture</summary>
			<ul>
				{#each gallery.warnings as warning (warning)}
					<li>{warning}</li>
				{/each}
			</ul>
		</details>
	{/if}
</main>

{#if gallery.selected}
	<Lightbox item={gallery.selected} />
{/if}

<style>
	main {
		padding: 20px 22px 64px;
	}

	.state {
		max-width: 560px;
		margin: 14vh auto;
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

	.state code {
		font-family: var(--mono);
		font-size: 12.5px;
		color: var(--text);
		background: var(--surface-raised);
		padding: 1px 5px;
		border-radius: 4px;
	}

	.state pre {
		text-align: left;
		margin: 0;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
		overflow-x: auto;
	}

	.state pre code {
		background: none;
		padding: 0;
		color: var(--text-dim);
		font-size: 12px;
		line-height: 1.7;
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

	.state .path {
		margin-top: 14px;
		font-family: var(--mono);
		font-size: 11px;
		color: var(--text-faint);
		overflow-wrap: anywhere;
	}

	.error h2 {
		color: var(--warn);
	}

	.warnings {
		margin: 34px auto 0;
		max-width: 720px;
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
</style>
