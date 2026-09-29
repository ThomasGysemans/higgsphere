<script lang="ts">
	import type { GenerationItem } from '$lib/types';
	import { gallery } from '$lib/gallery.svelte';
	import Tile from './Tile.svelte';

	interface Props {
		items: GenerationItem[];
	}

	let { items }: Props = $props();

	const GAP = 16;

	let width = $state(0);

	const columnCount = $derived(width >= 1280 ? 4 : width >= 920 ? 3 : width >= 600 ? 2 : 1);

	/**
	 * Empilement glouton dans la colonne la plus courte. Les égalités vont à la
	 * colonne la plus à gauche : c'est ce qui fait que les premiers éléments se
	 * lisent de gauche à droite, du plus récent au plus ancien.
	 *
	 * « Égalité » s'entend à `GAP` près : deux ratios presque identiques (16:9
	 * contre 5504×3072) donnent des colonnes décalées de quelques pixels, et une
	 * comparaison stricte enverrait alors l'élément suivant tout à droite, en
	 * laissant un trou au milieu de la dernière ligne.
	 */
	const columns = $derived.by(() => {
		const count = Math.max(1, columnCount);
		const buckets: GenerationItem[][] = Array.from({ length: count }, () => []);
		if (!width) {
			// Avant la première mesure, on garde l'ordre source dans un seul seau.
			buckets[0] = [...items];
			return buckets;
		}

		const columnWidth = (width - GAP * (count - 1)) / count;
		const heights = new Array<number>(count).fill(0);

		for (const item of items) {
			const shortest = Math.min(...heights);
			const target = heights.findIndex((height) => height <= shortest + GAP);
			buckets[target].push(item);
			heights[target] += columnWidth / gallery.aspectOf(item) + GAP;
		}
		return buckets;
	});
</script>

<div class="wall" class:ready={width > 0} bind:clientWidth={width}>
	{#each columns as column, index (index)}
		<div class="column">
			{#each column as item (item.id)}
				<Tile {item} fresh={gallery.freshIds.includes(item.id)} />
			{/each}
		</div>
	{/each}
</div>

<style>
	.wall {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.wall.ready {
		opacity: 1;
	}

	.column {
		display: flex;
		flex-direction: column;
		gap: 16px;
		flex: 1 1 0;
		/* Sans ça, une tuile très large pousse sa colonne au-delà de sa part. */
		min-width: 0;
	}
</style>
