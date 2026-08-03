// Schwarzschild black hole, raymarched with real null geodesics.
// Per step: a = -1.5 * h^2 * p / r^5  (h = |p x v|, conserved per ray).
// This is the exact photon geodesic equation for a Schwarzschild metric
// with r_s = 1, so lensing, Einstein ring and photon ring are physical.
export const fragmentShader = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse; // eased parallax, roughly -1..1

out vec4 outColor;

const float R_S = 1.0;        // Schwarzschild radius
const float DISK_IN = 3.0;    // ~ISCO
const float DISK_OUT = 11.0;
const float CAM_R = 14.5;
const float ESCAPE_R = 27.0;
const int MAX_STEPS = 130;

// --- hash / noise -----------------------------------------------------------

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3) {
	p3 = fract(p3 * 0.1031);
	p3 += dot(p3, p3.zyx + 31.32);
	return fract((p3.x + p3.y) * p3.z);
}

float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
		mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x),
		f.y
	);
}

float fbm2(vec2 p) {
	float v = 0.0;
	float a = 0.55;
	for (int i = 0; i < 3; i++) {
		v += a * noise2(p);
		p = p * 2.13 + 17.0;
		a *= 0.5;
	}
	return v;
}

float noise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(
			mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
			mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x),
			f.y
		),
		mix(
			mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
			mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x),
			f.y
		),
		f.z
	);
}

// --- background: lensed starfield + faint nebula ----------------------------

vec3 starLayer(vec3 d, float scale, float intensity) {
	vec3 g = d * scale;
	vec3 id = floor(g);
	float h = hash13(id);
	if (h < 0.94) return vec3(0.0);
	vec3 off = vec3(hash13(id + 7.1), hash13(id + 13.7), hash13(id + 27.3)) - 0.5;
	vec3 f = fract(g) - 0.5 - off * 0.7;
	float b = exp(-dot(f, f) * 90.0) * pow((h - 0.94) / 0.06, 2.0);
	// slight cool/warm variation per star
	vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.93, 0.85), hash13(id + 3.3));
	return tint * b * intensity;
}

vec3 background(vec3 d) {
	vec3 col = starLayer(d, 55.0, 1.4) + starLayer(d, 110.0, 0.55);
	// dim blue-grey nebula, barely there
	float n = noise3(d * 2.4 + u_time * 0.006) * 0.62 + noise3(d * 5.3 - u_time * 0.004) * 0.38;
	n = pow(max(n - 0.22, 0.0), 2.4);
	col += n * vec3(0.13, 0.16, 0.30);
	col += vec3(0.004, 0.005, 0.009); // deep-space floor, not pure black
	return col;
}

// --- accretion disk ---------------------------------------------------------

// emission color+strength at point p; photon travel direction vdir
vec4 disk(vec3 p, vec3 vdir) {
	float r = length(p.xz);
	if (r < DISK_IN * 0.82 || r > DISK_OUT) return vec4(0.0);

	float t01 = (r - DISK_IN) / (DISK_OUT - DISK_IN);
	// radial density profile: sharp-ish inner edge, long soft outer falloff
	float rad = smoothstep(DISK_IN * 0.82, DISK_IN * 1.15, r) * pow(1.0 - clamp(t01, 0.0, 1.0), 1.6);
	// vertical gaussian, disk thickens outwards
	float thick = 0.16 + 0.22 * t01;
	float vert = exp(-p.y * p.y / (thick * thick));
	if (rad * vert < 0.003) return vec4(0.0);

	// differential (Keplerian) rotation shears the noise field over time
	float ang = u_time * 0.35 * inversesqrt(r * r * r);
	float ca = cos(ang), sa = sin(ang);
	vec2 q = mat2(ca, -sa, sa, ca) * p.xz;
	float n = fbm2(q * 1.15 + u_time * 0.02) * 0.65 + fbm2(q * 3.4 + 31.0 - u_time * 0.03) * 0.35;
	n = 0.12 + 0.88 * pow(max(n, 0.0), 2.6);

	float density = rad * vert * n;

	// relativistic-ish Doppler beaming: orbiting matter approaching the
	// camera (opposite the photon travel direction) brightens and whitens
	vec3 orbit = normalize(vec3(-p.z, 0.0, p.x));
	float vmag = 0.55 * inversesqrt(r);
	float dop = 1.0 / max(1.0 - vmag * dot(orbit, -vdir), 0.35);
	float beam = dop * dop * dop;

	// cold palette: blue-white core -> cyan -> deep violet rim
	vec3 col = mix(vec3(1.15, 1.25, 1.45), vec3(0.40, 0.65, 1.25), smoothstep(0.0, 0.45, t01));
	col = mix(col, vec3(0.38, 0.20, 0.80), smoothstep(0.35, 1.0, t01));
	col += vec3(0.18, 0.28, 0.50) * clamp((dop - 1.0) * 0.8, -0.35, 0.7);

	// gravitational redshift dims the inner edge
	float g = sqrt(max(1.0 - R_S / r, 0.0));
	float bright = (3.4 / (r * r * 0.22 + 0.6)) * beam * pow(g, 1.5);

	return vec4(col * bright, density);
}

// --- geodesic march ---------------------------------------------------------

vec3 render(vec3 ro, vec3 rd) {
	vec3 p = ro;
	vec3 v = rd;
	vec3 hv = cross(p, v);
	float h2 = dot(hv, hv);

	vec3 col = vec3(0.0);
	float trans = 1.0;
	bool captured = false;
	float minR = 1e9;

	for (int i = 0; i < MAX_STEPS; i++) {
		float r2 = dot(p, p);
		float r = sqrt(r2);
		minR = min(minR, r);
		if (r < R_S) { captured = true; break; }
		if (r > ESCAPE_R && dot(p, v) > 0.0) break;

		// fine steps near the disk plane and near the hole, coarse far away
		float dt = min(0.10 * r, 0.35 * abs(p.y) + 0.05);

		v += (-1.5 * h2 / (r2 * r2 * r)) * p * dt;
		p += v * dt;

		vec4 d = disk(p, normalize(v));
		if (d.a > 0.0) {
			col += d.rgb * d.a * dt * trans;
			trans *= exp(-d.a * 2.2 * dt);
			if (trans < 0.02) break;
		}
	}

	if (!captured && trans > 0.02) {
		col += trans * background(normalize(v));
	}

	// faint cool halo hugging the shadow, from closest approach to the horizon
	float glow = exp(-max(minR - R_S, 0.0) * 2.2);
	col += vec3(0.30, 0.45, 0.85) * glow * 0.045 * trans;
	return col;
}

// --- camera + post ----------------------------------------------------------

void main() {
	// sub-pixel ray jitter, new pattern each frame: temporal dithering that
	// smooths the hard horizon silhouette into fine noise under the film grain
	vec2 jit = vec2(hash12(gl_FragCoord.xy + fract(u_time) * 71.3),
	                hash12(gl_FragCoord.yx + fract(u_time) * 39.7)) - 0.5;
	vec2 uv = (2.0 * (gl_FragCoord.xy + jit * 0.75) - u_res) / u_res.y;

	// glacial orbit + slow bob above/below the disk plane; mouse adds a nudge
	float orbA = 0.014 * u_time + 3.7 + u_mouse.x * 0.07;
	float elev = 0.14 + 0.07 * sin(u_time * 0.011) + u_mouse.y * 0.06;

	vec3 ro = CAM_R * vec3(cos(orbA) * cos(elev), sin(elev), sin(orbA) * cos(elev));
	vec3 fwd = normalize(-ro);
	vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
	vec3 up = cross(rgt, fwd);
	vec3 rd = normalize(fwd * 1.45 + uv.x * rgt + uv.y * up);

	vec3 col = render(ro, rd);

	// tonemap, then pull saturation back up (exp tonemap greys the highlights)
	col = 1.0 - exp(-col * 1.35);
	col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.22);
	col = pow(max(col, 0.0), vec3(0.9));

	// vignette + film grain for the mood
	col *= mix(0.42, 1.0, smoothstep(1.9, 0.5, length(uv)));
	col += (hash12(gl_FragCoord.xy + fract(u_time) * vec2(157.0, 113.0)) - 0.5) * 0.045;

	outColor = vec4(col, 1.0);
}
`;

export const vertexShader = `#version 300 es
// fullscreen triangle from gl_VertexID — no buffers needed
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
