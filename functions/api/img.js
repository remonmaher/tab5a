// Strict photo finder: only returns a photo whose NAME matches the dish. No match = no photo.
const out = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } });
const get = async (url) => { try { const r = await fetch(url, { headers: { 'user-agent': 'Tab5a/1.0 (recipe app)' } }); return r.ok ? await r.json() : null; } catch (_) { return null; } };
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const FOOD = /\b(dish|food|cuisine|soup|stew|salad|bread|pastry|dessert|cake|sandwich|pasta|rice|meal|snack|sauce|noodle|dumpling|pie|breakfast|curry|pudding|cookie|biscuit|sweet|confection|omelette|casserole|kebab|tart)\b/i;

async function mealdb(q) {
  const j = await get('https://www.themealdb.com/api/json/v1/1/search.php?s=' + encodeURIComponent(q));
  const want = norm(q).split(' ');
  for (const m of (j && j.meals) || []) {
    const have = norm(m.strMeal).split(' ');
    // every word of the dish name must appear, and the names must be nearly the same length
    if (m.strMealThumb && want.every(w => have.includes(w)) && Math.abs(have.length - want.length) <= 1)
      return { url: m.strMealThumb, credit: 'TheMealDB', creditUrl: 'https://www.themealdb.com/meal/' + m.idMeal };
  }
}
async function wiki(q) {
  const title = encodeURIComponent(q.trim().replace(/\s+/g, '_'));
  const j = await get('https://en.wikipedia.org/api/rest_v1/page/summary/' + title + '?redirect=true');
  if (!j || j.type !== 'standard' || !j.thumbnail) return;
  if (!FOOD.test((j.description || '') + ' ' + (j.extract || '').slice(0, 300))) return;
  return { url: j.thumbnail.source.replace(/\/\d+px-/, '/800px-'), credit: 'Wikipedia', creditUrl: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || 'https://en.wikipedia.org' };
}

export async function onRequestGet({ request }) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 3) return out({ none: true });
  return out((await mealdb(q)) || (await wiki(q)) || { none: true });
}
