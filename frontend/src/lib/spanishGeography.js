const PROVINCE_BY_ISO = {
  'ES-A': 'Alicante',
  'ES-AB': 'Albacete',
  'ES-AL': 'Almería',
  'ES-AV': 'Ávila',
  'ES-B': 'Barcelona',
  'ES-BA': 'Badajoz',
  'ES-BI': 'Bizkaia',
  'ES-BU': 'Burgos',
  'ES-C': 'A Coruña',
  'ES-CA': 'Cádiz',
  'ES-CC': 'Cáceres',
  'ES-CE': 'Ceuta',
  'ES-CO': 'Córdoba',
  'ES-CR': 'Ciudad Real',
  'ES-CS': 'Castellón',
  'ES-CU': 'Cuenca',
  'ES-GC': 'Las Palmas',
  'ES-GI': 'Girona',
  'ES-GR': 'Granada',
  'ES-GU': 'Guadalajara',
  'ES-H': 'Huelva',
  'ES-HU': 'Huesca',
  'ES-J': 'Jaén',
  'ES-L': 'Lleida',
  'ES-LE': 'León',
  'ES-LO': 'La Rioja',
  'ES-LU': 'Lugo',
  'ES-M': 'Madrid',
  'ES-MA': 'Málaga',
  'ES-ML': 'Melilla',
  'ES-MU': 'Murcia',
  'ES-NA': 'Navarra',
  'ES-O': 'Asturias',
  'ES-OR': 'Ourense',
  'ES-P': 'Palencia',
  'ES-PM': 'Illes Balears',
  'ES-PO': 'Pontevedra',
  'ES-S': 'Cantabria',
  'ES-SA': 'Salamanca',
  'ES-SE': 'Sevilla',
  'ES-SG': 'Segovia',
  'ES-SO': 'Soria',
  'ES-SS': 'Gipuzkoa',
  'ES-T': 'Tarragona',
  'ES-TE': 'Teruel',
  'ES-TF': 'Santa Cruz de Tenerife',
  'ES-TO': 'Toledo',
  'ES-V': 'Valencia',
  'ES-VA': 'Valladolid',
  'ES-VI': 'Araba/Álava',
  'ES-Z': 'Zaragoza',
  'ES-ZA': 'Zamora',
};

const AUTONOMOUS_COMMUNITY_BY_ISO = {
  'ES-AN': 'Andalucía',
  'ES-AR': 'Aragón',
  'ES-AS': 'Asturias',
  'ES-CB': 'Cantabria',
  'ES-CE': 'Ceuta',
  'ES-CL': 'Castilla y León',
  'ES-CM': 'Castilla-La Mancha',
  'ES-CN': 'Canarias',
  'ES-CT': 'Cataluña',
  'ES-EX': 'Extremadura',
  'ES-GA': 'Galicia',
  'ES-IB': 'Baleares',
  'ES-MC': 'Murcia',
  'ES-MD': 'Madrid',
  'ES-ML': 'Melilla',
  'ES-NC': 'Navarra',
  'ES-PV': 'País Vasco',
  'ES-RI': 'La Rioja',
  'ES-VC': 'Comunidad Valenciana',
};

const COMMUNITY_ALIASES = {
  'Comunidad de Madrid': 'Madrid',
  'Comunidad Foral de Navarra': 'Navarra',
  'Euskadi': 'País Vasco',
  'Illes Balears': 'Baleares',
  'Islas Baleares': 'Baleares',
  'Región de Murcia': 'Murcia',
};

export function normalizeSpanishGeography(address = {}) {
  const provinceCode = address['ISO3166-2-lvl6']?.toUpperCase();
  const communityCode = address['ISO3166-2-lvl4']?.toUpperCase();
  const rawCommunity = address.state || address.region || '';

  return {
    province: PROVINCE_BY_ISO[provinceCode]
      || address.province
      || address.state_district
      || address.county
      || '',
    autonomousCommunity: AUTONOMOUS_COMMUNITY_BY_ISO[communityCode]
      || COMMUNITY_ALIASES[rawCommunity]
      || rawCommunity,
  };
}

export { PROVINCE_BY_ISO, AUTONOMOUS_COMMUNITY_BY_ISO };
