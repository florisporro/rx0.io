/**
 * Animates the favicon: a centered black hole with cold blue glow and
 * subtle pops twinkling around it, echoing the page's shader palette.
 * Canvas + href swap because Chrome/Safari won't animate SVG/GIF favicons.
 * Returns a cleanup function.
 */
export function startFaviconAnimation(): () => void {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
	const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
	if (!link) return () => {};

	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 64;
	const ctx = canvas.getContext('2d');
	if (!ctx) return () => {};

	// blue-white core -> cyan -> violet, from the shader's cold palette
	const POP_COLORS = ['#dfe8ff', '#66a6ff', '#7a5cd9'];
	type Pop = { x: number; y: number; r: number; age: number; life: number; color: string };
	const pops: Pop[] = [];

	// ponytail: setInterval, not rAF — browsers throttle it to ~1fps in
	// background tabs, which is exactly the degradation we want
	const timer = setInterval(() => {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, 64, 64);

		// glow ring around the event horizon
		const glow = ctx.createRadialGradient(32, 32, 11, 32, 32, 22);
		glow.addColorStop(0, 'rgba(200, 216, 255, 0.9)');
		glow.addColorStop(0.4, 'rgba(102, 166, 255, 0.5)');
		glow.addColorStop(0.75, 'rgba(95, 63, 204, 0.25)');
		glow.addColorStop(1, 'rgba(95, 63, 204, 0)');
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(32, 32, 22, 0, Math.PI * 2);
		ctx.fill();

		// event horizon
		ctx.fillStyle = '#000';
		ctx.beginPath();
		ctx.arc(32, 32, 12, 0, Math.PI * 2);
		ctx.fill();

		// occasionally spawn a pop outside the glow
		if (pops.length < 3 && Math.random() < 0.15) {
			const a = Math.random() * Math.PI * 2;
			const d = 22 + Math.random() * 8;
			pops.push({
				x: 32 + Math.cos(a) * d,
				y: 32 + Math.sin(a) * d,
				r: 1 + Math.random() * 1.5,
				age: 0,
				life: 8 + Math.random() * 8,
				color: POP_COLORS[Math.floor(Math.random() * POP_COLORS.length)]
			});
		}

		// draw pops, fading in then out over their life
		for (let i = pops.length - 1; i >= 0; i--) {
			const p = pops[i];
			p.age++;
			if (p.age > p.life) {
				pops.splice(i, 1);
				continue;
			}
			const t = p.age / p.life;
			ctx.globalAlpha = Math.sin(t * Math.PI) * 0.8;
			ctx.fillStyle = p.color;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;

		link.href = canvas.toDataURL('image/png');
	}, 125);

	return () => clearInterval(timer);
}
