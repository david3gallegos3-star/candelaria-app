const KEY = 'candelaria_offline_borradores';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

export function addBorrador(b)       { save([b, ...load()]); }
export function removeBorrador(id)   { save(load().filter(b => b.id !== id)); }
export function getBorradores()      { return load(); }
export function getCount()           { return load().length; }
