const REF_X = 95.047;
const REF_Y = 100;
const REF_Z = 108.883;

export function rgbToXyz(r, g, b) {
  const linearize = (value) => {
    const channel = value / 255;
    return channel > 0.04045 ? ((channel + 0.055) / 1.055) ** 2.4 : channel / 12.92;
  };
  const lr = linearize(r), lg = linearize(g), lb = linearize(b);
  return {
    x: (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) * 100,
    y: (lr * 0.2126 + lg * 0.7152 + lb * 0.0722) * 100,
    z: (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) * 100,
  };
}

export function xyzToLab(x, y, z) {
  const convert = (value) => value > 0.008856 ? Math.cbrt(value) : (7.787 * value) + 16 / 116;
  const fx = convert(x / REF_X), fy = convert(y / REF_Y), fz = convert(z / REF_Z);
  return { l: (116 * fy) - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function rgbToLab(r, g, b) {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

export function deltaE76(lab1, lab2) {
  return Math.hypot(lab1.l - lab2.l, lab1.a - lab2.a, lab1.b - lab2.b);
}

export function deltaE2000(lab1, lab2) {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const C1 = Math.hypot(lab1.a, lab1.b), C2 = Math.hypot(lab2.a, lab2.b);
  const cBar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt((cBar ** 7) / (cBar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * lab1.a, a2p = (1 + G) * lab2.a;
  const C1p = Math.hypot(a1p, lab1.b), C2p = Math.hypot(a2p, lab2.b);
  const hp = (a, b) => { const angle = Math.atan2(b, a) * deg; return angle >= 0 ? angle : angle + 360; };
  const h1p = hp(a1p, lab1.b), h2p = hp(a2p, lab2.b);
  const dLp = lab2.l - lab1.l, dCp = C2p - C1p;
  let dhp = h2p - h1p;
  if (C1p * C2p === 0) dhp = 0;
  else if (dhp > 180) dhp -= 360;
  else if (dhp < -180) dhp += 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbar = (lab1.l + lab2.l) / 2, Cbar = (C1p + C2p) / 2;
  let hbar = h1p + h2p;
  if (C1p * C2p === 0) hbar = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbar /= 2;
  else if (hbar < 360) hbar = (hbar + 360) / 2;
  else hbar = (hbar - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hbar - 30) * rad) + 0.24 * Math.cos(2 * hbar * rad) + 0.32 * Math.cos((3 * hbar + 6) * rad) - 0.20 * Math.cos((4 * hbar - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbar - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt((Cbar ** 7) / (Cbar ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * ((Lbar - 50) ** 2)) / Math.sqrt(20 + ((Lbar - 50) ** 2));
  const Sc = 1 + 0.045 * Cbar, Sh = 1 + 0.015 * Cbar * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  const lTerm = dLp / Sl, cTerm = dCp / Sc, hTerm = dHp / Sh;
  return Math.sqrt(lTerm ** 2 + cTerm ** 2 + hTerm ** 2 + Rt * cTerm * hTerm);
}
