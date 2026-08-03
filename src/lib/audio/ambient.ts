// Generative ambient drone: detuned oscillators on an open chord
// (root/fifth/ninth/octave — no thirds, so neither happy nor sad),
// root slowly wandering a pentatonic set, plus filtered brown-noise
// "space wind", all through a procedurally generated reverb.

const ROOTS = [110.0, 130.81, 146.83, 164.81, 196.0]; // A2 pentatonic
const INTERVALS = [1, 1.5, 2, 2.25]; // root, 5th, octave, 9th
const MASTER_LEVEL = 0.16;

// percussion grid: 16 steps per bar, one huge boom per bar (~4.8s),
// smaller hits scattered around it
const STEP_S = 0.3;
const STEPS_PER_BAR = 16;
const BARS_PER_CHORD = 4; // chord changes land on the boom, every 4th bar

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bus: GainNode | null = null;
let perc: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let whiteBuf: AudioBuffer | null = null;
let oscs: OscillatorNode[] = [];
let padGain: GainNode | null = null;
let rootIndex = 0;
let nextStep = 0;
let stepCount = 0;
let beatTimer: ReturnType<typeof setInterval> | undefined;
let suspendTimer: ReturnType<typeof setTimeout> | undefined;
let playing = false;

function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
	const len = Math.floor(ctx.sampleRate * seconds);
	const buf = ctx.createBuffer(2, len, ctx.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const d = buf.getChannelData(ch);
		for (let i = 0; i < len; i++) {
			d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
		}
	}
	return buf;
}

function makeBrownNoise(ctx: AudioContext): AudioBuffer {
	const len = ctx.sampleRate * 4;
	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const d = buf.getChannelData(0);
	let last = 0;
	for (let i = 0; i < len; i++) {
		last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
		d[i] = last * 3.5;
	}
	return buf;
}

function slowLfo(ctx: AudioContext, hz: number, depth: number, target: AudioParam) {
	const lfo = ctx.createOscillator();
	lfo.frequency.value = hz;
	const g = ctx.createGain();
	g.gain.value = depth;
	lfo.connect(g).connect(target);
	lfo.start();
}

function build() {
	ctx = new AudioContext();
	master = ctx.createGain();
	master.gain.value = 0;
	master.connect(ctx.destination);

	const reverb = ctx.createConvolver();
	reverb.buffer = makeImpulse(ctx, 3.2);
	const wet = ctx.createGain();
	wet.gain.value = 0.85;
	reverb.connect(wet).connect(master);
	const dry = ctx.createGain();
	dry.gain.value = 0.5;
	dry.connect(master);
	bus = ctx.createGain();
	bus.connect(reverb);
	bus.connect(dry);

	// percussion: drenched in reverb with only a little direct signal,
	// which is what makes it read as distant and enormous
	perc = ctx.createGain();
	perc.connect(reverb);
	const percDry = ctx.createGain();
	percDry.gain.value = 0.45;
	perc.connect(percDry).connect(master);

	// white noise for ticks/snare — brown noise has no top end to filter out
	whiteBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
	const wd = whiteBuf.getChannelData(0);
	for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;

	// pad: shared warm lowpass, slowly breathing
	const padFilter = ctx.createBiquadFilter();
	padFilter.type = 'lowpass';
	padFilter.frequency.value = 650;
	padFilter.Q.value = 0.4;
	padGain = ctx.createGain();
	padFilter.connect(padGain).connect(bus);
	slowLfo(ctx, 0.045, 260, padFilter.frequency);

	rootIndex = 0;
	const root = ROOTS[rootIndex];
	for (const interval of INTERVALS) {
		for (const detune of [-4, 4]) {
			const osc = ctx.createOscillator();
			osc.type = 'triangle';
			osc.frequency.value = root * interval;
			osc.detune.value = detune;
			const g = ctx.createGain();
			g.gain.value = 0.07 / Math.sqrt(interval); // higher voices quieter
			osc.connect(g).connect(padFilter);
			osc.start();
			oscs.push(osc);
		}
	}

	// space wind
	noiseBuf = makeBrownNoise(ctx);
	const noise = ctx.createBufferSource();
	noise.buffer = noiseBuf;
	noise.loop = true;
	const noiseFilter = ctx.createBiquadFilter();
	noiseFilter.type = 'lowpass';
	noiseFilter.frequency.value = 240;
	slowLfo(ctx, 0.03, 130, noiseFilter.frequency);
	const noiseGain = ctx.createGain();
	noiseGain.gain.value = 0.22;
	noise.connect(noiseFilter).connect(noiseGain).connect(bus);
	noise.start();
}

// decaying sine hit with a pitch drop — the building block for all drums here
function thump(t: number, amp: number, f0: number, f1: number, decay: number) {
	const osc = ctx!.createOscillator();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(f0, t);
	osc.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.6);
	const g = ctx!.createGain();
	g.gain.setValueAtTime(0, t);
	g.gain.linearRampToValueAtTime(amp, t + 0.02);
	g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
	osc.connect(g).connect(perc!);
	osc.start(t);
	osc.stop(t + decay + 0.1);
}

// bandpassed white-noise burst: ticks, hats, snare crack
function noiseHit(t: number, amp: number, freq: number, q: number, decay: number) {
	const src = ctx!.createBufferSource();
	src.buffer = whiteBuf;
	const bp = ctx!.createBiquadFilter();
	bp.type = 'bandpass';
	bp.frequency.value = freq;
	bp.Q.value = q;
	const g = ctx!.createGain();
	g.gain.setValueAtTime(0, t);
	g.gain.linearRampToValueAtTime(amp, t + 0.006);
	g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
	src.connect(bp).connect(g).connect(perc!);
	src.start(t, Math.random() * 0.9);
	src.stop(t + decay + 0.05);
}

// distant hat-like tick
function tick(t: number, amp: number) {
	noiseHit(t, amp, 3200 + Math.random() * 1800, 3.5, 0.08);
}

// snare-ish answer on the half bar: mid knock + noise crack
function snare(t: number) {
	thump(t, 0.26, 200, 90, 0.4);
	noiseHit(t, 0.2, 1700, 1.2, 0.28);
}

// one huge distant boom: sub layer for weight + mid knock so it carries
// on small speakers, long tail into the reverb
function boom(t: number) {
	thump(t, 0.55, 80, 34, 2.8);
	thump(t, 0.22, 165, 70, 0.7);
}

// the groove: deterministic backbone so it reads as a beat,
// probabilistic ghosts on top so bars vary
const HATS = new Set([2, 4, 6, 10, 12, 14]);
const GHOSTS: Record<number, number> = { 5: 0.35, 7: 0.45, 11: 0.35, 13: 0.3, 15: 0.5 };

function scheduleStep(step: number, t: number) {
	if (step === 0) {
		boom(t);
	} else if (step === 8) {
		snare(t);
	} else if (HATS.has(step)) {
		tick(t, step % 4 === 2 ? 0.15 : 0.09); // alternating emphasis
	} else if (Math.random() < (GHOSTS[step] ?? 0)) {
		tick(t + (Math.random() - 0.5) * 0.016, 0.04 + Math.random() * 0.04);
	}
}

function scheduleBeats() {
	if (!ctx) return;
	// lookahead scheduler: keep ~1.2s of the grid queued
	while (nextStep < ctx.currentTime + 1.2) {
		if (nextStep > ctx.currentTime) {
			if (stepCount > 0 && stepCount % (STEPS_PER_BAR * BARS_PER_CHORD) === 0) {
				driftChord(nextStep);
			}
			scheduleStep(stepCount % STEPS_PER_BAR, nextStep);
		}
		nextStep += STEP_S;
		stepCount++;
	}
}

// wander to a neighbouring pentatonic root, switching exactly at time t
// (with the boom). A fast pad dip cushions the cut; the reverb tail of the
// old chord fills the gap.
function driftChord(t: number) {
	rootIndex = Math.max(0, Math.min(ROOTS.length - 1, rootIndex + (Math.random() < 0.5 ? -1 : 1)));
	const root = ROOTS[rootIndex];
	oscs.forEach((osc, i) => {
		osc.frequency.cancelScheduledValues(t);
		osc.frequency.setValueAtTime(root * INTERVALS[Math.floor(i / 2)], t);
	});
	const g = padGain!.gain;
	g.cancelScheduledValues(t - 0.3);
	g.setValueAtTime(1, t - 0.3);
	g.linearRampToValueAtTime(0.25, t - 0.03);
	g.linearRampToValueAtTime(1, t + 0.9);
}

/** Toggles the ambience; resolves to the new playing state. */
export async function toggleAmbient(): Promise<boolean> {
	if (!ctx) build();
	clearTimeout(suspendTimer);
	const now = () => ctx!.currentTime;

	if (!playing) {
		await ctx!.resume();
		master!.gain.cancelScheduledValues(now());
		master!.gain.setValueAtTime(Math.max(master!.gain.value, 0.0001), now());
		master!.gain.exponentialRampToValueAtTime(MASTER_LEVEL, now() + 3);
		nextStep = now() + 1.0;
		stepCount = 0; // restart the bar so the boom lands first
		scheduleBeats();
		beatTimer = setInterval(scheduleBeats, 400);
		playing = true;
	} else {
		master!.gain.cancelScheduledValues(now());
		master!.gain.setValueAtTime(Math.max(master!.gain.value, 0.0001), now());
		master!.gain.exponentialRampToValueAtTime(0.0001, now() + 2.5);
		clearInterval(beatTimer);
		suspendTimer = setTimeout(() => ctx?.suspend(), 3000);
		playing = false;
	}
	return playing;
}
