<script lang="ts">
	interface Props {
		text: string;
		/** Nombre de lignes visibles une fois replié. */
		lines?: number;
	}

	let { text, lines = 8 }: Props = $props();

	const id = $props.id();

	let el = $state<HTMLElement | null>(null);
	let expanded = $state(false);
	let overflows = $state(false);

	$effect(() => {
		// Le bouton « voir plus » n'existe que si le texte dépasse réellement la
		// hauteur repliée. La mesure ne se fait que replié : déplié, le texte tient
		// toujours, et le bouton « voir moins » disparaîtrait.
		const node = el;
		if (!node) return;
		void text;
		void lines;
		const measure = () => {
			if (!expanded) overflows = node.scrollHeight > node.clientHeight + 1;
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	});
</script>

<!-- Le texte reste collé aux balises : en `pre-wrap`, une indentation serait rendue. -->
<p
	{id}
	class="text"
	class:clamped={!expanded}
	class:faded={!expanded && overflows}
	style:--lines={lines}
	bind:this={el}
>{text}</p>
{#if overflows}
	<button type="button" class="more" aria-expanded={expanded} aria-controls={id} onclick={() => (expanded = !expanded)}>
		{expanded ? 'voir moins' : 'voir plus'}
	</button>
{/if}

<style>
	.text {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.6;
		color: var(--text);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	/* Le fondu n'est posé que si le texte est réellement coupé, sinon il
	   estomperait la dernière ligne pour rien. */
	.clamped {
		max-height: calc(1.6em * var(--lines));
		overflow: hidden;
	}

	.faded {
		mask-image: linear-gradient(to bottom, #000 55%, transparent);
	}

	.more {
		margin-top: 6px;
		padding: 0;
		font-size: 12px;
		color: var(--text-dim);
		border-bottom: 1px solid var(--line-strong);
		transition: color 0.16s ease;
	}

	.more:hover {
		color: var(--text);
	}
</style>
