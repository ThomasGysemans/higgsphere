<script lang="ts">
	/**
	 * Rend une traduction dont les segments entre accents graves deviennent des
	 * `<code>`. Les traductions restent du texte brut : aucun `{@html}`, donc
	 * aucune balise ne peut s'y glisser, et un traducteur n'a qu'une convention
	 * de type Markdown à respecter.
	 *
	 * Le `<code>` est rendu ici : le parent qui veut le styler doit passer par
	 * `:global(code)` sous l'une de ses propres classes.
	 */
	let { text }: { text: string } = $props();

	const parts = $derived(text.split('`'));
</script>

{#each parts as part, index (index)}{#if index % 2}<code>{part}</code>{:else}{part}{/if}{/each}
