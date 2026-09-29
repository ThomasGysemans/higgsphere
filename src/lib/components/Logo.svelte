<script lang="ts">
	/**
	 * La marque : une sphère prise dans son anneau — « higgs » + « sphere ».
	 *
	 * L'anneau sert aussi d'indicateur de surveillance : allumé en menthe quand le
	 * canal SSE est branché, éteint sinon. La sphère, elle, ne change jamais — la
	 * marque doit rester reconnaissable dans les deux états.
	 *
	 * Le dessin tient en trois tracés empilés pour donner la profondeur sans masque :
	 *   1. l'anneau complet,
	 *   2. la sphère opaque qui en cache la moitié arrière,
	 *   3. l'arc avant redessiné par-dessus.
	 */
	let { live = false, size = 20 }: { live?: boolean; size?: number } = $props();

	// Le dégradé est instancié par composant : deux marques sur une même page ne
	// doivent pas se disputer le même identifiant.
	const uid = $props.id();
	const gradient = `higgsphere-sphere-${uid}`;
</script>

<span
	class="logo"
	class:live
	style:--size="{size}px"
	title={live ? 'Surveillance active' : 'Hors ligne'}
>
	<svg viewBox="0 0 32 32" aria-hidden="true">
		<defs>
			<radialGradient id={gradient} cx="34%" cy="28%" r="78%">
				<stop offset="0%" stop-color="#cdbfff" />
				<stop offset="42%" stop-color="#8b6cff" />
				<stop offset="100%" stop-color="#4a2ed2" />
			</radialGradient>
		</defs>

		<!-- L'anneau, en entier : la moitié arrière ne survivra qu'aux extrémités. -->
		<ellipse
			class="ring"
			cx="16"
			cy="16"
			rx="14.2"
			ry="5.4"
			transform="rotate(-25 16 16)"
			fill="none"
			stroke-width="2"
		/>

		<!-- La sphère, opaque : c'est elle qui découpe l'anneau. -->
		<circle cx="16" cy="16" r="8" fill="url(#{gradient})" />

		<!-- L'arc avant, repassé sur la face de la sphère. -->
		<path
			class="ring"
			d="M28.87 10 A14.2 5.4 -25 0 1 18.28 20.89 A14.2 5.4 -25 0 1 3.13 22"
			fill="none"
			stroke-width="2"
			stroke-linecap="round"
		/>
	</svg>
</span>

<style>
	.logo {
		display: inline-flex;
		flex: none;
		width: var(--size);
		height: var(--size);
	}

	.logo svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.ring {
		stroke: var(--text-faint);
		transition: stroke 0.3s ease, filter 0.3s ease;
	}

	.logo.live .ring {
		stroke: var(--mint);
		filter: drop-shadow(0 0 4px rgba(61, 219, 180, 0.55));
	}
</style>
