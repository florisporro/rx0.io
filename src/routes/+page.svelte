<script lang="ts">
	import { onMount } from 'svelte';
	import { startBlackHole } from '$lib/blackhole/renderer';
	import { toggleAmbient } from '$lib/audio/ambient';

	let canvas: HTMLCanvasElement;
	let webgl = $state(true);
	let audioOn = $state(false);

	onMount(() => {
		const stop = startBlackHole(canvas);
		if (!stop) {
			webgl = false;
			return;
		}
		return stop;
	});

	async function onAudioToggle() {
		audioOn = await toggleAmbient();
	}
</script>

<svelte:head>
	<title>rx0.io</title>
	<meta name="description" content="rx0.io" />
	<meta name="theme-color" content="#000000" />
</svelte:head>

<div class="fixed inset-0 overflow-hidden bg-black">
	<canvas bind:this={canvas} class="h-full w-full" class:hidden={!webgl} aria-hidden="true"
	></canvas>

	<h1 class="wordmark absolute bottom-[16%] left-1/2 -translate-x-1/2 text-3xl md:text-4xl">
		rx0.io
	</h1>

	<button
		onclick={onAudioToggle}
		aria-pressed={audioOn}
		aria-label={audioOn ? 'Mute ambient sound' : 'Play ambient sound'}
		class="absolute right-5 bottom-5 cursor-pointer p-2 text-white/35 transition-all duration-500 hover:text-white/80"
	>
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
			stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
			<path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
			{#if audioOn}
				<path d="M15.5 8.5a5 5 0 0 1 0 7" />
				<path d="M18.5 5.5a9 9 0 0 1 0 13" />
			{:else}
				<line x1="16" y1="9" x2="22" y2="15" />
				<line x1="22" y1="9" x2="16" y2="15" />
			{/if}
		</svg>
	</button>
</div>
