// Terra Mirror — genomes, mutation, natural selection primitives

export const GENE_KEYS = ['spd', 'sns', 'met', 'sz', 'hue'];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const gauss = (r) => {
  // Box-Muller-lite: sum of uniforms
  return (r() + r() + r() + r() - 2) * 0.866; // ~N(0,1)
};

export function randomGenome(r) {
  return {
    spd: r(),
    sns: 0.15 + r() * 0.6,
    met: 0.3 + r() * 0.5,
    sz: 0.15 + r() * 0.7,
    hue: Math.floor(r() * 360),
  };
}

// radiation: multiplier on mutation rate (real Kp index drives this)
export function mutate(g, baseRate, radiation, r) {
  const rate = baseRate * radiation;
  const ng = { ...g };
  for (const k of ['spd', 'sns', 'met', 'sz']) {
    if (r() < rate) ng[k] = clamp01(ng[k] + gauss(r) * 0.12);
  }
  if (r() < rate) {
    ng.hue = (((ng.hue + gauss(r) * 24) % 360) + 360) % 360;
  }
  return ng;
}

export function genomeCost(g) {
  // bigger, faster, sharper senses cost more energy
  return (
    1 +
    g.sz * 1.4 +
    g.spd * 1.1 +
    g.sns * 0.9 +
    g.met * 0.7
  );
}

export function lifespan(g) {
  // ticks — small & slow lives longer (r-selection tradeoff inverted)
  return Math.floor(900 - g.sz * 380 - g.met * 160);
}

export function reproThreshold(g) {
  return 60 + g.sz * 70;
}
