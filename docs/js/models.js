// Vehicle list = folders of the official repo https://github.com/teslamotors/custom-wraps
// Templates are fetched at run time from a pinned commit (they are not copied into this repo).
export const TESLA_REPO = 'teslamotors/custom-wraps';
export const TESLA_SHA = '86c7d31454caf0f20af6f6af105f577643f13bce';
export const RAW = `https://raw.githubusercontent.com/${TESLA_REPO}/${TESLA_SHA}`;

export const MODELS = [
  { id: 'modely-l',                name: 'Model Y L',        sub: { zh: '六座',            en: '6-seater' } },
  { id: 'modely-2025-base',        name: 'Model Y',          sub: { zh: '2025+ 标准版',     en: '2025+ Standard' } },
  { id: 'modely-2025-premium',     name: 'Model Y',          sub: { zh: '2025+ 长续航',     en: '2025+ Premium' } },
  { id: 'modely-2025-performance', name: 'Model Y',          sub: { zh: '2025+ 高性能',     en: '2025+ Performance' } },
  { id: 'modely',                  name: 'Model Y',          sub: { zh: '2020–2024',       en: '2020–2024' } },
  { id: 'model3-2024-base',        name: 'Model 3',          sub: { zh: '2024+ 焕新版',     en: '2024+ Standard & Premium' } },
  { id: 'model3-2024-performance', name: 'Model 3',          sub: { zh: '2024+ 高性能',     en: '2024+ Performance' } },
  { id: 'model3',                  name: 'Model 3',          sub: { zh: '2017–2023',       en: '2017–2023' } },
  { id: 'models-2025-plaid',       name: 'Model S',          sub: { zh: '2025+ Plaid',     en: '2025+ Plaid' } },
  { id: 'models-2021',             name: 'Model S',          sub: { zh: '2021+',           en: '2021+' } },
  { id: 'modelx-2021',             name: 'Model X',          sub: { zh: '2021+',           en: '2021+' } },
  { id: 'cybertruck',              name: 'Cybertruck',       sub: { zh: '1024×768',        en: '1024×768' } },
];

export const templateUrl = (id) => `${RAW}/${id}/template.png`;
export const vehicleUrl = (id) => `${RAW}/${id}/vehicle_image.png`;
