export const BENCHMARK_PROFILE_OPTIONS = [
  { value: '', label: 'Sin perfil específico' },
  { value: 'caes', label: 'CAEs' },
  { value: 'new_business', label: 'Nuevos Negocios' },
  { value: 'integrated', label: 'CAEs + Nuevos Negocios' },
];

export const BENCHMARK_PROFILE_LABELS = Object.fromEntries(
  BENCHMARK_PROFILE_OPTIONS.map(option => [option.value, option.label]),
);

export function defaultScopeForBenchmarkProfile(profile) {
  if (profile === 'caes') return 'caes';
  if (profile === 'new_business') return 'new_business';
  if (profile === 'integrated') return 'all';
  return 'auto';
}

export function benchmarkProfileInstruction(profile) {
  if (profile === 'caes') {
    return 'Perfil del usuario: especialista CAEs. Si el texto es ambiguo, prioriza CAEs, pero clasifica por el contenido explícito.';
  }
  if (profile === 'new_business') {
    return 'Perfil del usuario: especialista en Nuevos Negocios. Si el texto es ambiguo, prioriza Nuevos Negocios, pero clasifica por el contenido explícito.';
  }
  if (profile === 'integrated') {
    return 'Perfil del usuario: visión jerárquica integradora de CAEs y Nuevos Negocios. No favorezcas un dominio sin evidencia en el texto.';
  }
  return 'El usuario no tiene una especialización predeterminada. Clasifica únicamente por el contenido.';
}
