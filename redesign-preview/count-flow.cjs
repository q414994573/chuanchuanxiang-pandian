'use strict';
const ProductNames = require('./product-names.cjs');

const NUM = /^\d+(?:\.\d{1,3})?$/;
const NAMES = {kr:'韩国食品', cn:'中国食品', other:'其他商品'};

function isNumericQty(text) {
  const s = String(text ?? '').trim();
  if (!NUM.test(s)) return false;
  const n = Number(s);
  return n > 0 && n <= 1000000;
}

function showsOnOrder(text) {
  const s = String(text ?? '').trim();
  if (!s) return false;
  if (NUM.test(s)) return Number(s) > 0;
  return true;
}

function numericFragment(text) {
  return /^\d*\.?\d*$/.test(String(text ?? ''));
}

function advance(catalog, index) {
  const cur = catalog[index];
  const next = catalog[index + 1];
  if (!cur || !next || next.cat !== cur.cat) {
    const cat = cur ? cur.cat : null;
    const nextCat = cat === 'kr' ? 'cn' : cat === 'cn' ? 'other' : null;
    return {stay: true, cat, nextCat};
  }
  return {stay: false, index: index + 1, cat: cur.cat, nextCat: null};
}

function endLabel(cat) {
  const name = NAMES[cat] || '这一类';
  if (cat === 'kr') return `${name}盘完了 · 去中国食品`;
  if (cat === 'cn') return `${name}盘完了 · 去其他商品`;
  return `${name}盘完了 · 看今日订单`;
}

function textOrderIds(draft, numberFn) {
  if (!draft) return [];
  return draft.catalog.filter(p => {
    const r = draft.items[p.id];
    return r && r.decision === 'order' && String(r.quantity || '').trim() && numberFn(r.quantity) === null;
  }).map(p => p.id);
}

function parkTextStocks(draft, core) {
  draft.stockText = draft.stockText && typeof draft.stockText === 'object' ? draft.stockText : {};
  for (const p of draft.catalog) {
    const s = draft.items[p.id].stock;
    if (s && core.number(s) === null) {
      draft.stockText[p.id] = s;
      core.edit(draft, p.id, 'stock', '');
    } else if (draft.stockText[p.id]) delete draft.stockText[p.id];
  }
}

function largeName(p) {
  return ProductNames.large(p);
}

function smallName(p) {
  return ProductNames.small(p);
}

function sheetRows(products) {
  const rows = [];
  for (const cat of ['kr', 'cn', 'other']) {
    for (const p of products) {
      if (p.cat !== cat) continue;
      rows.push({
        n: rows.length + 1,
        block: NAMES[cat],
        large: largeName(p),
        small: smallName(p),
        unit: p.unit == null ? '' : String(p.unit)
      });
    }
  }
  return rows;
}

function countTitleHtml(p, esc) {
  const e = esc || (s => String(s ?? ''));
  const small = smallName(p);
  if (p?.hideUnit) return `<b><i class="dot"></i>${e(largeName(p))}</b>${small ? `<small>${e(small)}</small>` : ''}`;
  const unit = p && p.unit ? String(p.unit) : '单位未定';
  return `<b><i class="dot"></i>${e(largeName(p))}</b><small>${small ? e(small) + ' · ' : ''}${e(unit)}</small>`;
}

function boldName(p, esc) {
  const e = esc || (s => String(s ?? ''));
  return `<b>${e(largeName(p))}</b>`;
}

function stripe(index) {
  return index % 2 ? 'band' : '';
}

function countFields(product) {
  return product && product.hasStock ? ['stock', 'qty'] : ['qty'];
}

function indexById(catalog, id) {
  if (!catalog || id == null || id === '') return -1;
  return catalog.findIndex(p => p && p.id === id);
}

function visibleCountIndexes(catalog, cat, matches, activeIndex) {
  const out = [];
  (catalog || []).forEach((p, i) => {
    if (!p || p.cat !== cat) return;
    if (i !== activeIndex && !(typeof matches === 'function' && matches(p))) return;
    out.push(i);
  });
  return out;
}

const SEARCH_CATS = ['kr', 'cn', 'other'];

function searchHitCounts(catalog, matches) {
  const counts = {kr: 0, cn: 0, other: 0};
  (catalog || []).forEach(p => {
    if (!p || counts[p.cat] == null || typeof matches !== 'function' || !matches(p)) return;
    counts[p.cat]++;
  });
  return counts;
}

function searchCatChoice(counts, current) {
  const here = counts && counts[current] || 0;
  if (here > 0) return current;
  let best = current;
  let bestN = 0;
  for (const cat of SEARCH_CATS) {
    const n = counts && counts[cat] || 0;
    if (n > bestN) {
      best = cat;
      bestN = n;
    }
  }
  return bestN > 0 ? best : current;
}

module.exports = {
  isNumericQty, showsOnOrder, numericFragment, advance, endLabel, textOrderIds, parkTextStocks, NAMES,
  largeName, smallName, sheetRows, countTitleHtml, boldName, stripe, countFields, indexById, visibleCountIndexes,
  searchHitCounts, searchCatChoice
};
