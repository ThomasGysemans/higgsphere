<script lang="ts">
	import type { GenerationItem } from '$lib/types';
	import { gallery } from '$lib/gallery.svelte';
	import { formatDuration } from '$lib/format';
	import { i18n } from '$lib/i18n/index.svelte';

	interface Props {
		item: GenerationItem;
		fresh?: boolean;
	}

	let { item, fresh = false }: Props = $props();

	let video = $state<HTMLVideoElement | null>(null);
	let hovering = $state(false);
	let loaded = $state(false);

	const aspect = $derived(gallery.aspectOf(item));

	function onEnter() {
		hovering = true;
		if (item.kind !== 'video' || !video) return;
		video.muted = true;
		// play() échoue si l'élément est démonté en cours de geste : le pointeur
		// est simplement déjà parti, il n'y a rien à rattraper.
		void video.play().catch(() => {});
	}

	function onLeave() {
		hovering = false;
		if (item.kind !== 'video' || !video) return;
		video.pause();
		video.currentTime = 0;
	}

	function onImageLoad(event: Event) {
		const img = event.currentTarget as HTMLImageElement;
		gallery.reportAspect(item.id, img.naturalWidth, img.naturalHeight);
		loaded = true;
	}

	function onVideoMeta(event: Event) {
		const el = event.currentTarget as HTMLVideoElement;
		gallery.reportAspect(item.id, el.videoWidth, el.videoHeight);
		loaded = true;
	}
</script>

<button
	type="button"
	class="tile"
	class:fresh
	class:loaded
	style="--aspect: {aspect}"
	onclick={() => gallery.select(item.id)}
	onpointerenter={onEnter}
	onpointerleave={onLeave}
	onfocus={onEnter}
	onblur={onLeave}
	aria-label={i18n.m.tile.open(item.prompt ? item.prompt.slice(0, 80) : item.name)}
>
	<div class="frame">
		{#if item.kind === 'video'}
			<video
				bind:this={video}
				src={item.url}
				poster={item.posterUrl ?? undefined}
				preload="metadata"
				muted
				loop
				playsinline
				onloadedmetadata={onVideoMeta}
			></video>
			<span class="badge kind" class:playing={hovering}>
				{#if hovering}
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
				{:else}
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" /></svg
					>
				{/if}
				{#if item.duration}<em>{formatDuration(item.duration)}</em>{/if}
			</span>
		{:else}
			<img src={item.url} alt={item.prompt || item.name} loading="lazy" onload={onImageLoad} />
		{/if}
	</div>

	<div class="overlay">
		<p class="prompt">{item.prompt || item.name}</p>
		<div class="chips">
			{#if item.model}<span class="chip">{item.model}</span>{/if}
			{#if item.width && item.height}<span class="chip dim">{item.width}×{item.height}</span>{/if}
		</div>
	</div>

	{#if fresh}<span class="flag">{i18n.m.tile.fresh}</span>{/if}
</button>

<style>
	.tile {
		position: relative;
		display: block;
		width: 100%;
		text-align: left;
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-card);
		transition:
			transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
			border-color 0.22s ease,
			box-shadow 0.22s ease;
	}

	.tile:hover,
	.tile:focus-visible {
		transform: translateY(-3px);
		border-color: var(--line-strong);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5), 0 18px 44px rgba(0, 0, 0, 0.5);
	}

	.frame {
		position: relative;
		width: 100%;
	}

	/* Le ratio ne fait que réserver la place ; le média n'est jamais étiré. */
	.frame::before {
		content: '';
		display: block;
		padding-top: calc(100% / var(--aspect, 1));
	}

	.frame :is(img, video) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		background: #0d0d10;
		opacity: 0;
		transition: opacity 0.35s ease;
	}

	.loaded .frame :is(img, video) {
		opacity: 1;
	}

	.overlay {
		position: absolute;
		inset: auto 0 0 0;
		padding: 32px 12px 11px;
		background: linear-gradient(to top, rgba(4, 4, 6, 0.94) 12%, rgba(4, 4, 6, 0) 100%);
		opacity: 0;
		transform: translateY(6px);
		transition:
			opacity 0.22s ease,
			transform 0.22s ease;
		pointer-events: none;
	}

	.tile:hover .overlay,
	.tile:focus-visible .overlay {
		opacity: 1;
		transform: none;
	}

	.prompt {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.4;
		color: #f2f2f6;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 7px;
	}

	.chip {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.02em;
		padding: 2px 6px;
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.12);
		color: #e6e6ee;
		backdrop-filter: blur(6px);
	}

	.chip.dim {
		color: var(--text-dim);
	}

	.badge.kind {
		position: absolute;
		top: 9px;
		left: 9px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 7px;
		border-radius: 7px;
		background: rgba(6, 6, 9, 0.68);
		backdrop-filter: blur(8px);
		color: #f0f0f5;
		transition: background 0.2s ease;
	}

	.badge.kind.playing {
		background: var(--accent);
	}

	.badge.kind svg {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}

	.badge.kind em {
		font-family: var(--mono);
		font-style: normal;
		font-size: 10px;
	}

	.flag {
		position: absolute;
		top: 9px;
		right: 9px;
		font-family: var(--mono);
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		padding: 3px 7px;
		border-radius: 6px;
		background: var(--mint);
		color: #05201a;
		font-weight: 600;
	}

	.tile.fresh {
		border-color: rgba(61, 219, 180, 0.5);
		animation: landed 4s ease-out;
	}

	@keyframes landed {
		0% {
			box-shadow: 0 0 0 0 rgba(61, 219, 180, 0.55);
		}
		40% {
			box-shadow: 0 0 0 10px rgba(61, 219, 180, 0);
		}
		100% {
			box-shadow: var(--shadow-card);
		}
	}
</style>
