<script lang="ts">
	import { onMount } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { startFaviconAnimation } from '$lib/favicon';

	let { children } = $props();

	onMount(() => startFaviconAnimation());
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
