// Terra Mirror — procedural naming for a living world
const SYL_A = ['ka','ra','mi','to','vu','ne','sa','lo','xi','pa','zu','me','ta','ri','vo','ku'];
const SYL_B = ['ren','sha','lin','dor','vel','mor','tis','nal','ser','gan','phi','oth','run','kel'];
const SYL_C = ['a','i','o','u','ae','ei','ou','ia'];

const hash32 = (n) => {
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) | 0;
  n = n ^ (n >>> 4);
  n = (n * 0x27d4eb2d) | 0;
  n = n ^ (n >>> 15);
  return n >>> 0;
};

export function autoName(sp, id) {
  const h = hash32(id * 2654435761 + (sp === 'P' ? 7 : 13));
  const a = SYL_A[h % SYL_A.length];
  const b = SYL_B[(h >>> 5) % SYL_B.length];
  const c = SYL_C[(h >>> 11) % SYL_C.length];
  return a + b + c;
}

export const SPECIES_NAME = {
  H: { zh: '噬草獸', en: 'Grazer' },
  P: { zh: '獵影獸', en: 'Stalker' },
};

export function creatureLabel(c) {
  return c.name || `${SPECIES_NAME[c.sp].en}「${autoName(c.sp, c.id)}」#${c.id}`;
}
