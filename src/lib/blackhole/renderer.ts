import { fragmentShader, vertexShader } from './fragment.glsl';

// ponytail: internal render scale — the scene is soft, upscaling is invisible
const RENDER_SCALE = 0.66;
const MAX_DPR = 2;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
	const s = gl.createShader(type)!;
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
		throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile failed');
	}
	return s;
}

/**
 * Starts the black hole render loop on the canvas.
 * Returns a cleanup function, or null if WebGL2 is unavailable
 * (caller shows the static fallback).
 */
export function startBlackHole(canvas: HTMLCanvasElement): (() => void) | null {
	const gl = canvas.getContext('webgl2', {
		antialias: false,
		alpha: false,
		depth: false,
		stencil: false,
		powerPreference: 'low-power'
	});
	if (!gl) return null;

	let program: WebGLProgram;
	let uRes: WebGLUniformLocation | null;
	let uTime: WebGLUniformLocation | null;
	let uMouse: WebGLUniformLocation | null;

	function init() {
		program = gl!.createProgram()!;
		gl!.attachShader(program, compile(gl!, gl!.VERTEX_SHADER, vertexShader));
		gl!.attachShader(program, compile(gl!, gl!.FRAGMENT_SHADER, fragmentShader));
		gl!.linkProgram(program);
		if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
			throw new Error(gl!.getProgramInfoLog(program) ?? 'link failed');
		}
		gl!.useProgram(program);
		uRes = gl!.getUniformLocation(program, 'u_res');
		uTime = gl!.getUniformLocation(program, 'u_time');
		uMouse = gl!.getUniformLocation(program, 'u_mouse');
	}
	try {
		init();
	} catch (e) {
		console.error(e);
		return null;
	}

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let raf = 0;
	let running = false;
	let start = performance.now();
	let pausedAt = 0;
	// mouse parallax target vs eased value
	let mx = 0,
		my = 0,
		emx = 0,
		emy = 0;

	function resize() {
		const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * RENDER_SCALE;
		const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
		const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
			gl!.viewport(0, 0, w, h);
		}
	}

	function drawFrame(timeSec: number) {
		resize();
		emx += (mx - emx) * 0.03;
		emy += (my - emy) * 0.03;
		gl!.uniform2f(uRes, canvas.width, canvas.height);
		gl!.uniform1f(uTime, timeSec);
		gl!.uniform2f(uMouse, emx, emy);
		gl!.drawArrays(gl!.TRIANGLES, 0, 3);
	}

	function loop(now: number) {
		drawFrame((now - start) / 1000);
		raf = requestAnimationFrame(loop);
	}

	function play() {
		if (running) return;
		running = true;
		if (pausedAt) start += performance.now() - pausedAt; // don't jump time forward
		raf = requestAnimationFrame(loop);
	}

	function pause() {
		if (!running) return;
		running = false;
		pausedAt = performance.now();
		cancelAnimationFrame(raf);
	}

	const onMouse = (e: PointerEvent) => {
		mx = (e.clientX / window.innerWidth) * 2 - 1;
		my = (e.clientY / window.innerHeight) * 2 - 1;
	};
	const onVisibility = () => (document.hidden ? pause() : play());
	const onLost = (e: Event) => {
		e.preventDefault();
		pause();
	};
	const onRestored = () => {
		init();
		play();
	};

	if (reducedMotion) {
		// single static frame, no drift, no listeners beyond resize
		const staticDraw = () => drawFrame(40);
		staticDraw();
		window.addEventListener('resize', staticDraw);
		return () => window.removeEventListener('resize', staticDraw);
	}

	window.addEventListener('pointermove', onMouse, { passive: true });
	document.addEventListener('visibilitychange', onVisibility);
	canvas.addEventListener('webglcontextlost', onLost);
	canvas.addEventListener('webglcontextrestored', onRestored);
	play();

	return () => {
		pause();
		window.removeEventListener('pointermove', onMouse);
		document.removeEventListener('visibilitychange', onVisibility);
		canvas.removeEventListener('webglcontextlost', onLost);
		canvas.removeEventListener('webglcontextrestored', onRestored);
	};
}
