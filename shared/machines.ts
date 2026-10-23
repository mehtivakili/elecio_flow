/**
 * CNC controller catalogue: brands and their common controller models. Workspaces add
 * their own models on top (stored in controller_models), so this list only needs to be a
 * good starting point. `legacy` is the matching option of the old «کنترلرها» field, kept in
 * sync for lead scoring.
 */

export interface ControllerBrand {
  key: string;
  label: string;
  fa: string;
  color: string;
  legacy: string;
  models: string[];
}

export const CONTROLLER_BRANDS: ControllerBrand[] = [
  {
    key: 'fanuc', label: 'FANUC', fa: 'فانوک', color: '#F5C400', legacy: 'Fanuc',
    models: [
      '0i-MF Plus', '0i-TF Plus', '0i-MF', '0i-TF', '0i-MD', '0i-TD', '0i Mate-MD', '0i Mate-TD', '0i-MC', '0i-TC', '0i Mate-MC', '0i Mate-TC',
      '0i-MB', '0i-TB', '0i-MA', '0i-TA', '0-MC', '0-TC', '0-MD', '0-TD', '0-M', '0-T',
      '30i-B', '31i-B', '31i-B5', '32i-B', '35i-B', '30i-A', '31i-A', '31i-A5', '32i-A',
      '16i-MB', '18i-MB', '18i-MB5', '21i-MB', '16i-TB', '18i-TB', '21i-TB', '16i-MA', '18i-MA', '21i-MA', '16i-TA', '18i-TA', '21i-TA',
      '15i-MB', '15-MB', '15-MA', '15-TB', '16-MC', '16-TC', '18-MC', '18-TC', '21-MB', '21-TB',
      '11M', '11T', '10M', '10T', '6M', '6T', '3M', '3T', 'Power Mate i-D', 'Power Mate i-H',
    ],
  },
  {
    key: 'siemens', label: 'SIEMENS', fa: 'زیمنس', color: '#00A4A6', legacy: 'Siemens',
    models: [
      'SINUMERIK ONE', '840D sl', '840D pl', '840D', '840Di sl', '840Di', '840C', '828D', '828D Basic', '808D Advanced', '808D',
      '802D sl', '802D', '802S', '802C', '810D', '810M', '810T', '820M', '850M', '880M', 'Sinumerik 3M', 'Sinumerik 8M',
    ],
  },
  {
    key: 'heidenhain', label: 'HEIDENHAIN', fa: 'هایدن‌هاین', color: '#2B6CB0', legacy: 'Heidenhain',
    models: [
      'TNC7', 'TNC 640', 'TNC 620', 'TNC 320', 'TNC 128', 'iTNC 530', 'TNC 530', 'TNC 430', 'TNC 426', 'TNC 425', 'TNC 415', 'TNC 410',
      'TNC 407', 'TNC 370', 'TNC 360', 'TNC 355', 'TNC 310', 'TNC 306', 'TNC 155', 'TNC 151', 'TNC 150', 'TNC 145', 'TNC 135',
      'CNC PILOT 640', 'CNC PILOT 620', 'MANUALplus 620', 'MANUALplus 4110',
    ],
  },
  {
    key: 'mitsubishi', label: 'MITSUBISHI', fa: 'میتسوبیشی', color: '#E4002B', legacy: 'Mitsubishi',
    models: ['M800', 'M80', 'M80V', 'M800V', 'M700V', 'M700', 'M70V', 'M70', 'E80', 'E70', 'C80', 'C70', 'M64', 'M65', 'M64S', 'M60S', 'M520', 'M500', 'M300', 'MELDAS 50'],
  },
  {
    key: 'haas', label: 'HAAS', fa: 'هاس', color: '#C8102E', legacy: 'Haas',
    models: ['Next Generation Control (NGC)', 'Classic Haas Control'],
  },
  {
    key: 'mazak', label: 'MAZAK', fa: 'مازاک', color: '#E67E22', legacy: 'سایر',
    models: ['MAZATROL SmoothAi', 'MAZATROL SmoothX', 'MAZATROL SmoothG', 'MAZATROL SmoothC', 'MAZATROL Matrix 2', 'MAZATROL Matrix', 'MAZATROL 640M', 'MAZATROL 640T', 'MAZATROL Fusion 640', 'MAZATROL M-Plus', 'MAZATROL T-Plus', 'MAZATROL M-32', 'MAZATROL T-32'],
  },
  {
    key: 'okuma', label: 'OKUMA', fa: 'اوکوما', color: '#0B7A3E', legacy: 'سایر',
    models: ['OSP-P500', 'OSP-P300', 'OSP-P300S', 'OSP-P200', 'OSP-P100', 'OSP-U100', 'OSP-E100', 'OSP-7000', 'OSP-5020', 'OSP-700'],
  },
  {
    key: 'fagor', label: 'FAGOR', fa: 'فاگور', color: '#D35400', legacy: 'سایر',
    models: ['8070', '8065', '8060', '8058', '8055', '8055i', '8040', '8037', '8035', '8025', '8030'],
  },
  {
    key: 'syntec', label: 'SYNTEC', fa: 'سینتک', color: '#1E88E5', legacy: 'Syntec',
    models: ['220MA', '22MA', '21MA', '11MA', '10MA', '6MA', '6MB', '21TA', '11TA', '6TA', '60W', '60C'],
  },
  {
    key: 'gsk', label: 'GSK', fa: 'جی‌اس‌کی', color: '#7B1FA2', legacy: 'سایر',
    models: ['25i', '27i', '988MD', '990MA', '983Ma', '980MDi', '980MDc', '980TDi', '980TDc', '980TB3', '218MC', '928TE'],
  },
  {
    key: 'knd', label: 'KND', fa: 'کی‌ان‌دی', color: '#5E35B1', legacy: 'سایر',
    models: ['K2000MC', 'K2000M', 'K1000MC', 'K1000M', 'K1000T', 'K100Mi'],
  },
  {
    key: 'brother', label: 'BROTHER', fa: 'برادر', color: '#1565C0', legacy: 'سایر',
    models: ['CNC-D00', 'CNC-C00', 'CNC-B00', 'CNC-A00'],
  },
  {
    key: 'hurco', label: 'HURCO', fa: 'هورکو', color: '#455A64', legacy: 'سایر',
    models: ['MAX5', 'MAX4', 'WinMax', 'Ultimax 4', 'Ultimax 3'],
  },
  {
    key: 'num', label: 'NUM', fa: 'نام', color: '#00897B', legacy: 'سایر',
    models: ['Flexium+', 'Flexium', 'Axium Power', '1060', '1050', '1040', '1020', '760'],
  },
  {
    key: 'fidia', label: 'FIDIA', fa: 'فیدیا', color: '#8D6E63', legacy: 'سایر',
    models: ['nC 30', 'C20', 'C10', 'C1'],
  },
  {
    key: 'delta', label: 'DELTA', fa: 'دلتا', color: '#0097A7', legacy: 'سایر',
    models: ['NC311', 'NC300', 'NC200'],
  },
  {
    key: 'lnc', label: 'LNC', fa: 'ال‌ان‌سی', color: '#6D4C41', legacy: 'سایر',
    models: ['M6800', 'M600', 'M520', 'T600'],
  },
  {
    key: 'other', label: 'سایر', fa: 'سایر برندها', color: '#9DB4C0', legacy: 'سایر',
    models: [],
  },
];

/** Shown first in the brand picker; the rest open under «برندهای دیگر». */
export const MAIN_BRANDS = ['fanuc', 'siemens', 'heidenhain', 'mitsubishi', 'haas', 'syntec'];

export const brandOf = (key?: string | null) => CONTROLLER_BRANDS.find((b) => b.key === key) ?? CONTROLLER_BRANDS[CONTROLLER_BRANDS.length - 1];

export const MACHINE_TYPES: Record<string, string> = {
  vmc: 'فرز CNC عمودی',
  hmc: 'فرز CNC افقی',
  five_axis: 'فرز ۵ محور',
  gantry: 'فرز دروازه‌ای',
  boring: 'بورینگ CNC',
  lathe: 'تراش CNC',
  mill_turn: 'فرز-تراش (Mill-Turn)',
  swiss: 'تراش اتوماتیک (Swiss)',
  edm: 'اسپارک (EDM)',
  wire_edm: 'وایرکات',
  grinder: 'سنگ CNC',
  router: 'روتر CNC',
  laser: 'لیزر / پلاسما / واترجت',
  other: 'سایر',
};

/** Suggestions for the machine maker field (the workspace's own entries are added on top). */
export const MACHINE_MAKERS = [
  'DMG MORI', 'Deckel Maho', 'Haas', 'Mazak', 'Okuma', 'Doosan', 'Hyundai WIA', 'Hurco', 'Brother', 'FANUC Robodrill', 'Hermle', 'Makino',
  'Chiron', 'Matsuura', 'Kitamura', 'Mikron', 'GF Machining', 'Leadwell', 'Feeler', 'Victor Taichung', 'Quaser', 'Hartford', 'Tongtai',
  'Spinner', 'EMCO', 'Mori Seiki', 'Toshiba', 'Sodick', 'Charmilles', 'AgieCharmilles', 'Fadal', 'Cincinnati', 'Bridgeport',
  'ماشین‌سازی تبریز', 'ماشین‌سازی اراک', 'تراشکاری ایران',
];
