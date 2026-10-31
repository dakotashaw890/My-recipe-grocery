// Ingredient swaps: what to use when you're out of something. Amounts are per the "for" amount and scale to the recipe.
// Each entry: [ingredient (and other names it covers), for [qty, unit], [[note, [qty, unit, ingredient], ...], ...]]
const SWAPS = [
  [['Buttermilk'], [1, 'cup'], [['Let stand 5 minutes', [1, 'cup', 'Milk'], [1, 'tbsp', 'Lemon juice']], ['Let stand 5 minutes', [1, 'cup', 'Milk'], [1, 'tbsp', 'White vinegar']], ['Thin with a little milk', [0.75, 'cup', 'Plain yogurt'], [0.25, 'cup', 'Milk']]]],
  [['Sour cream'], [1, 'cup'], [['Same amount', [1, 'cup', 'Plain Greek yogurt']], ['Blend smooth', [1, 'cup', 'Cottage cheese'], [1, 'tbsp', 'Lemon juice']]]],
  [['Plain Greek yogurt', 'Plain yogurt'], [1, 'cup'], [['Same amount', [1, 'cup', 'Sour cream']]]],
  [['Heavy cream'], [1, 'cup'], [['Not for whipping', [0.75, 'cup', 'Milk'], [0.25, 'cup', 'Butter']], ['Not for whipping', [1, 'cup', 'Half-and-half']], ['Dairy-free', [1, 'cup', 'Coconut cream']]]],
  [['Half-and-half'], [1, 'cup'], [['', [0.5, 'cup', 'Milk'], [0.5, 'cup', 'Heavy cream']], ['', [0.875, 'cup', 'Milk'], [1.5, 'tbsp', 'Butter']]]],
  [['Milk', '2% milk', '1% milk', 'Skim milk'], [1, 'cup'], [['', [0.5, 'cup', 'Evaporated milk'], [0.5, 'cup', 'Water']], ['Unsweetened', [1, 'cup', 'Almond milk']], ['', [1, 'cup', 'Oat milk']]]],
  [['Evaporated milk'], [1, 'cup'], [['Simmer milk until reduced by half', [2.25, 'cup', 'Milk']], ['', [1, 'cup', 'Half-and-half']]]],
  [['Sweetened condensed milk'], [14, 'oz'], [['Simmer until thick, about 30 minutes', [1.5, 'cup', 'Milk'], [0.67, 'cup', 'Granulated sugar'], [2, 'tbsp', 'Butter']]]],
  [['Butter', 'Unsalted butter'], [1, 'cup'], [['For baking', [1, 'cup', 'Margarine']], ['For cooking, not baking', [0.75, 'cup', 'Olive oil']], ['For baking, use 7/8 the amount', [0.875, 'cup', 'Vegetable oil']], ['Dairy-free baking', [1, 'cup', 'Coconut oil']]]],
  [['Eggs'], [1, 'ea.'], [['In baking; mix and rest 5 minutes', [1, 'tbsp', 'Flax seeds'], [3, 'tbsp', 'Water']], ['In baking', [0.25, 'cup', 'Applesauce']], ['In baking', [0.25, 'cup', 'Plain yogurt']], ['', [3, 'tbsp', 'Liquid eggs']]]],
  [['Cream cheese'], [8, 'oz'], [['Blend smooth', [1, 'cup', 'Ricotta cheese']], ['', [1, 'cup', 'Mascarpone']]]],
  [['Ricotta cheese'], [1, 'cup'], [['Blend smooth for a creamier texture', [1, 'cup', 'Cottage cheese']]]],
  [['Mascarpone'], [8, 'oz'], [['', [6, 'oz', 'Cream cheese'], [0.25, 'cup', 'Heavy cream']]]],
  [['Parmesan cheese'], [1, 'cup'], [['', [1, 'cup', 'Pecorino Romano']], ['', [1, 'cup', 'Asiago cheese']]]],
  [['Cheddar cheese', 'Shredded cheddar cheese'], [1, 'cup'], [['', [1, 'cup', 'Colby Jack cheese']], ['', [1, 'cup', 'Monterey Jack cheese']]]],
  [['Mozzarella cheese', 'Shredded mozzarella cheese'], [1, 'cup'], [['', [1, 'cup', 'Provolone cheese']], ['', [1, 'cup', 'Monterey Jack cheese']]]],
  [['Feta cheese'], [1, 'cup'], [['', [1, 'cup', 'Goat cheese']], ['', [1, 'cup', 'Queso fresco']]]],
  [['Queso fresco', 'Cotija cheese'], [1, 'cup'], [['', [1, 'cup', 'Feta cheese']]]],
  [['All-purpose flour'], [1, 'cup'], [['', [1, 'cup', 'Bread flour']], ['Denser result', [0.5, 'cup', 'Whole wheat flour'], [0.5, 'cup', 'All-purpose flour']]]],
  [['Cake flour'], [1, 'cup'], [['Sift together', [0.875, 'cup', 'All-purpose flour'], [2, 'tbsp', 'Cornstarch']]]],
  [['Self-rising flour'], [1, 'cup'], [['', [1, 'cup', 'All-purpose flour'], [1.5, 'tsp', 'Baking powder'], [0.25, 'tsp', 'Salt']]]],
  [['Bread flour'], [1, 'cup'], [['Slightly less chewy', [1, 'cup', 'All-purpose flour']]]],
  [['Cornstarch'], [1, 'tbsp'], [['For thickening', [2, 'tbsp', 'All-purpose flour']]]],
  [['Baking powder'], [1, 'tsp'], [['', [0.25, 'tsp', 'Baking soda'], [0.5, 'tsp', 'Cream of tartar']]]],
  [['Baking soda'], [1, 'tsp'], [['Also drop the salt', [3, 'tsp', 'Baking powder']]]],
  [['Granulated sugar'], [1, 'cup'], [['', [1, 'cup', 'Brown sugar']], ['Cut other liquid by 1/4 cup', [0.75, 'cup', 'Honey']], ['Cut other liquid by 3 tbsp', [0.75, 'cup', 'Maple syrup']]]],
  [['Brown sugar'], [1, 'cup'], [['Mix well', [1, 'cup', 'Granulated sugar'], [1, 'tbsp', 'Molasses']], ['', [1, 'cup', 'Coconut sugar']]]],
  [['Dark brown sugar'], [1, 'cup'], [['Mix well', [1, 'cup', 'Granulated sugar'], [2, 'tbsp', 'Molasses']]]],
  [['Powdered sugar'], [1, 'cup'], [['Blend until fine', [1, 'cup', 'Granulated sugar'], [1, 'tbsp', 'Cornstarch']]]],
  [['Honey'], [1, 'cup'], [['', [1, 'cup', 'Maple syrup']], ['', [1, 'cup', 'Agave nectar']]]],
  [['Maple syrup'], [1, 'cup'], [['', [1, 'cup', 'Honey']]]],
  [['Light corn syrup'], [1, 'cup'], [['Dissolve over low heat', [1.25, 'cup', 'Granulated sugar'], [0.33, 'cup', 'Water']]]],
  [['Vanilla extract'], [1, 'tsp'], [['', [1, 'tsp', 'Maple syrup']]]],
  [['Chocolate chips'], [1, 'cup'], [['Chopped', [6, 'oz', 'Baking chocolate']]]],
  [['Baking chocolate'], [1, 'oz'], [['Unsweetened', [3, 'tbsp', 'Cocoa powder'], [1, 'tbsp', 'Butter']]]],
  [['Lemon juice'], [1, 'tbsp'], [['', [1, 'tbsp', 'Lime juice']], ['', [0.5, 'tbsp', 'White vinegar']]]],
  [['Lime juice'], [1, 'tbsp'], [['', [1, 'tbsp', 'Lemon juice']]]],
  [['Lemons'], [1, 'ea.'], [['Juice of 1 lemon', [3, 'tbsp', 'Lemon juice']]]],
  [['Limes'], [1, 'ea.'], [['Juice of 1 lime', [2, 'tbsp', 'Lime juice']]]],
  [['White wine'], [1, 'cup'], [['', [1, 'cup', 'Chicken broth'], [1, 'tbsp', 'White wine vinegar']]]],
  [['Red wine'], [1, 'cup'], [['', [1, 'cup', 'Beef broth'], [1, 'tbsp', 'Red wine vinegar']]]],
  [['Apple cider vinegar'], [1, 'tbsp'], [['', [1, 'tbsp', 'White wine vinegar']], ['', [1, 'tbsp', 'Lemon juice']]]],
  [['Red wine vinegar', 'White wine vinegar'], [1, 'tbsp'], [['', [1, 'tbsp', 'Apple cider vinegar']]]],
  [['Rice vinegar'], [1, 'tbsp'], [['Add a pinch of sugar', [1, 'tbsp', 'Apple cider vinegar']]]],
  [['Balsamic vinegar'], [1, 'tbsp'], [['', [1, 'tbsp', 'Red wine vinegar'], [0.5, 'tsp', 'Honey']]]],
  [['Mirin'], [1, 'tbsp'], [['', [1, 'tbsp', 'Rice vinegar'], [0.5, 'tsp', 'Granulated sugar']]]],
  [['Chicken broth'], [1, 'cup'], [['', [1, 'cup', 'Vegetable broth']], ['Dissolve in hot water', [1, 'tsp', 'Chicken bouillon'], [1, 'cup', 'Water']]]],
  [['Beef broth'], [1, 'cup'], [['Dissolve in hot water', [1, 'tsp', 'Beef bouillon'], [1, 'cup', 'Water']], ['', [1, 'cup', 'Mushroom broth']]]],
  [['Vegetable broth'], [1, 'cup'], [['', [1, 'cup', 'Chicken broth']]]],
  [['Soy sauce'], [1, 'tbsp'], [['Gluten-free', [1, 'tbsp', 'Tamari']], ['', [0.5, 'tbsp', 'Worcestershire sauce'], [0.5, 'tbsp', 'Water']]]],
  [['Tamari'], [1, 'tbsp'], [['', [1, 'tbsp', 'Soy sauce']]]],
  [['Worcestershire sauce'], [1, 'tbsp'], [['', [1, 'tbsp', 'Soy sauce'], [0.25, 'tsp', 'Lemon juice']]]],
  [['Fish sauce'], [1, 'tbsp'], [['', [1, 'tbsp', 'Soy sauce'], [0.5, 'tsp', 'Lime juice']]]],
  [['Ketchup'], [1, 'cup'], [['', [1, 'cup', 'Tomato sauce'], [2, 'tbsp', 'Brown sugar'], [1, 'tbsp', 'White vinegar']]]],
  [['Tomato sauce'], [1, 'cup'], [['Stir in water', [0.5, 'cup', 'Tomato paste'], [0.5, 'cup', 'Water']]]],
  [['Tomato paste'], [1, 'tbsp'], [['Simmer down to thicken', [3, 'tbsp', 'Tomato sauce']], ['', [2, 'tbsp', 'Ketchup']]]],
  [['Crushed tomatoes', 'Diced tomatoes'], [14.5, 'oz'], [['Crush by hand', [14.5, 'oz', 'Whole peeled tomatoes']]]],
  [['Mayonnaise'], [1, 'cup'], [['', [1, 'cup', 'Plain Greek yogurt']]]],
  [['Dijon mustard'], [1, 'tbsp'], [['', [1, 'tbsp', 'Spicy brown mustard']], ['', [1, 'tsp', 'Ground mustard'], [2, 'tsp', 'Water']]]],
  [['Panko'], [1, 'cup'], [['', [1, 'cup', 'Breadcrumbs']], ['Crushed', [1, 'cup', 'Crackers']]]],
  [['Breadcrumbs', 'Italian breadcrumbs'], [1, 'cup'], [['', [1, 'cup', 'Panko']], ['Ground fine', [1, 'cup', 'Rolled oats']], ['Crushed', [1, 'cup', 'Crackers']]]],
  [['Rolled oats'], [1, 'cup'], [['Slightly softer texture', [1, 'cup', 'Quick oats']]]],
  [['Quick oats'], [1, 'cup'], [['Pulse a few times', [1, 'cup', 'Rolled oats']]]],
  [['Shortening', 'Vegetable shortening'], [1, 'cup'], [['', [1.125, 'cup', 'Butter']]]],
  [['Vegetable oil', 'Canola oil'], [1, 'cup'], [['', [1, 'cup', 'Avocado oil']], ['', [1, 'cup', 'Coconut oil']], ['Mild flavor', [1, 'cup', 'Olive oil']]]],
  [['Olive oil'], [1, 'tbsp'], [['', [1, 'tbsp', 'Avocado oil']], ['', [1, 'tbsp', 'Vegetable oil']]]],
  [['Fresh garlic', 'Garlic'], [1, 'ea.'], [['Per clove', [0.125, 'tsp', 'Garlic powder']], ['Per clove', [0.5, 'tsp', 'Minced garlic']]]],
  [['Onions', 'Yellow onions'], [1, 'ea.'], [['Per onion', [1, 'tbsp', 'Onion powder']], ['Per onion', [0.25, 'cup', 'Minced onion']]]],
  [['Shallots'], [1, 'ea.'], [['', [0.5, 'ea.', 'Yellow onions'], [1, 'ea.', 'Garlic']]]],
  [['Green onions'], [1, 'ea.'], [['Per bunch', [0.5, 'ea.', 'Shallots']], ['', [2, 'tbsp', 'Chives']]]],
  [['Fresh ginger', 'Ginger'], [1, 'tbsp'], [['Grated fresh → ground', [0.25, 'tsp', 'Ground ginger']]]],
  [['Fresh parsley', 'Parsley', 'Italian parsley'], [1, 'tbsp'], [['', [1, 'tsp', 'Dried parsley']], ['', [1, 'tbsp', 'Cilantro']]]],
  [['Cilantro'], [1, 'tbsp'], [['Different flavor', [1, 'tbsp', 'Italian parsley']]]],
  [['Basil', 'Fresh basil'], [1, 'tbsp'], [['', [1, 'tsp', 'Dried basil']]]],
  [['Thyme', 'Fresh thyme'], [1, 'tbsp'], [['', [1, 'tsp', 'Dried thyme']]]],
  [['Rosemary', 'Fresh rosemary'], [1, 'tbsp'], [['', [1, 'tsp', 'Dried rosemary']]]],
  [['Oregano', 'Fresh oregano'], [1, 'tbsp'], [['', [1, 'tsp', 'Dried oregano']]]],
  [['Dill', 'Fresh dill'], [1, 'tbsp'], [['', [1, 'tsp', 'Dried dill']]]],
  [['Sage', 'Fresh sage'], [1, 'tbsp'], [['', [1, 'tsp', 'Rubbed sage']]]],
  [['Dried oregano'], [1, 'tsp'], [['', [1, 'tsp', 'Italian seasoning']], ['', [1, 'tsp', 'Dried marjoram']]]],
  [['Italian seasoning'], [1, 'tsp'], [['', [0.25, 'tsp', 'Dried basil'], [0.25, 'tsp', 'Dried oregano'], [0.25, 'tsp', 'Dried thyme'], [0.25, 'tsp', 'Dried rosemary']]]],
  [['Pumpkin pie spice'], [1, 'tsp'], [['', [0.5, 'tsp', 'Ground cinnamon'], [0.25, 'tsp', 'Ground ginger'], [0.125, 'tsp', 'Ground nutmeg'], [0.125, 'tsp', 'Ground cloves']]]],
  [['Ground allspice'], [1, 'tsp'], [['', [0.5, 'tsp', 'Ground cinnamon'], [0.25, 'tsp', 'Ground nutmeg'], [0.25, 'tsp', 'Ground cloves']]]],
  [['Taco seasoning'], [1, 'oz'], [['About one packet', [1, 'tbsp', 'Chili powder'], [1.5, 'tsp', 'Ground cumin'], [0.5, 'tsp', 'Paprika'], [0.25, 'tsp', 'Garlic powder'], [0.25, 'tsp', 'Onion powder'], [0.5, 'tsp', 'Salt']]]],
  [['Cajun seasoning'], [1, 'tbsp'], [['', [1, 'tsp', 'Paprika'], [0.5, 'tsp', 'Garlic powder'], [0.5, 'tsp', 'Dried oregano'], [0.25, 'tsp', 'Cayenne pepper'], [0.5, 'tsp', 'Salt']]]],
  [['Chili powder'], [1, 'tbsp'], [['', [1, 'tsp', 'Paprika'], [1, 'tsp', 'Ground cumin'], [0.5, 'tsp', 'Dried oregano'], [0.25, 'tsp', 'Cayenne pepper']]]],
  [['Smoked paprika'], [1, 'tsp'], [['Add a drop of liquid smoke if you have it', [1, 'tsp', 'Paprika']]]],
  [['Red pepper flakes'], [1, 'tsp'], [['', [0.5, 'tsp', 'Cayenne pepper']]]],
  [['Kosher salt'], [1, 'tsp'], [['Table salt is saltier', [0.5, 'tsp', 'Salt']]]],
  [['Salt'], [1, 'tsp'], [['', [2, 'tsp', 'Kosher salt']]]],
  [['Ground beef'], [1, 'lb'], [['', [1, 'lb', 'Ground turkey']], ['', [1, 'lb', 'Ground chicken']], ['', [1, 'lb', 'Ground pork']]]],
  [['Ground turkey'], [1, 'lb'], [['', [1, 'lb', 'Ground beef']], ['', [1, 'lb', 'Ground chicken']]]],
  [['Chicken breasts'], [1, 'lb'], [['Juicier; cook a few minutes longer', [1, 'lb', 'Chicken thighs']]]],
  [['Chicken thighs'], [1, 'lb'], [['Leaner; cook a little less', [1, 'lb', 'Chicken breasts']]]],
  [['Bacon'], [1, 'lb'], [['', [1, 'lb', 'Turkey bacon']], ['', [1, 'lb', 'Pancetta']]]],
  [['Pancetta'], [4, 'oz'], [['', [4, 'oz', 'Bacon']]]],
  [['Spinach'], [10, 'oz'], [['', [10, 'oz', 'Kale']], ['Thaw and squeeze dry', [10, 'oz', 'Frozen spinach']]]],
  [['Kale'], [1, 'ea.'], [['', [1, 'ea.', 'Swiss chard']], ['', [10, 'oz', 'Spinach']]]],
  [['Zucchini'], [1, 'ea.'], [['', [1, 'ea.', 'Yellow squash']]]],
  [['Yellow squash'], [1, 'ea.'], [['', [1, 'ea.', 'Zucchini']]]],
  [['Bell peppers', 'Red bell peppers', 'Green bell peppers'], [1, 'ea.'], [['', [1, 'ea.', 'Poblano peppers']], ['', [1, 'cup', 'Roasted red peppers']]]],
  [['Jalapeños'], [1, 'ea.'], [['', [1, 'ea.', 'Serrano peppers']], ['', [2, 'tbsp', 'Pickled jalapeños']], ['', [2, 'tbsp', 'Green chiles']]]],
  [['Black beans', 'Pinto beans', 'Kidney beans'], [15, 'oz'], [['Any canned bean works', [15, 'oz', 'Pinto beans']], ['', [15, 'oz', 'Black beans']]]],
  [['Cannellini beans', 'Great Northern beans', 'Navy beans'], [15, 'oz'], [['Any white bean works', [15, 'oz', 'Great Northern beans']], ['', [15, 'oz', 'Chickpeas']]]],
  [['White rice'], [1, 'cup'], [['Cook longer, add water', [1, 'cup', 'Brown rice']], ['', [1, 'cup', 'Jasmine rice']], ['', [1, 'cup', 'Quinoa']]]],
  [['Jasmine rice', 'Basmati rice'], [1, 'cup'], [['', [1, 'cup', 'White rice']]]],
  [['Penne', 'Rigatoni', 'Ziti', 'Rotini', 'Fusilli', 'Farfalle', 'Macaroni', 'Shell pasta', 'Cavatappi'], [16, 'oz'], [['Any short pasta works', [16, 'oz', 'Penne']], ['', [16, 'oz', 'Rotini']]]],
  [['Spaghetti', 'Linguine', 'Fettuccine', 'Angel hair pasta', 'Thin spaghetti'], [16, 'oz'], [['Any long pasta works', [16, 'oz', 'Spaghetti']], ['', [16, 'oz', 'Linguine']]]],
  [['Egg noodles'], [12, 'oz'], [['', [12, 'oz', 'Fettuccine']]]],
  [['Cream of chicken soup', 'Cream of mushroom soup', 'Cream of celery soup'], [10.5, 'oz'], [['Whisk over heat until thick', [3, 'tbsp', 'Butter'], [3, 'tbsp', 'All-purpose flour'], [0.5, 'cup', 'Chicken broth'], [0.5, 'cup', 'Milk']]]],
  [['Corn tortillas'], [1, 'ea.'], [['', [1, 'ea.', 'Flour tortillas']]]],
  [['Flour tortillas'], [1, 'ea.'], [['', [1, 'ea.', 'Corn tortillas']]]],
  [['Hamburger buns'], [1, 'ea.'], [['', [1, 'ea.', 'Kaiser rolls']], ['', [1, 'ea.', 'Brioche']], ['2 slices', [2, 'ea.', 'Sandwich bread']]]],
  [['Pecans', 'Walnuts'], [1, 'cup'], [['', [1, 'cup', 'Walnuts']], ['', [1, 'cup', 'Pecans']]]],
  [['Almonds'], [1, 'cup'], [['', [1, 'cup', 'Cashews']]]],
  [['Peanut butter'], [1, 'cup'], [['', [1, 'cup', 'Almond butter']], ['Nut-free', [1, 'cup', 'Sunflower seed butter']]]],
  [['Coconut milk'], [13.5, 'fl oz'], [['', [1.5, 'cup', 'Heavy cream']], ['', [1.5, 'cup', 'Plain Greek yogurt']]]],
  [['Active dry yeast'], [0.25, 'oz'], [['Skip proofing; mix with the flour', [0.25, 'oz', 'Instant yeast']]]],
  [['Instant yeast'], [0.25, 'oz'], [['Proof in warm water first', [0.25, 'oz', 'Active dry yeast']]]],
  [['Graham crackers'], [1, 'cup'], [['Crushed', [1, 'cup', 'Vanilla wafers']]]],
];

// lookup: built-in name -> entry (other names in the entry point at it too)
let swapIndex = null;
function swapsFor(name) {
  if (!swapIndex) { swapIndex = new Map(); for (const e of SWAPS) for (const n of e[0]) swapIndex.set(CATALOG_NORM(n), e) }
  const k = CATALOG_NORM(name), e = swapIndex.get(k) || (typeof catalogEntry === 'function' && catalogEntry(name) && swapIndex.get(CATALOG_NORM(catalogEntry(name).name)));
  if (!e) return null;
  return { for: e[1], options: e[2].map(o => ({ note: o[0], parts: o.slice(1) })).filter(o => !o.parts.every(p => CATALOG_NORM(p[2]) === k)) };
}
const swapPartName = n => (typeof familyIngredient === 'function' && familyIngredient(n)) || n;
// How many "for" amounts the recipe calls for (null when the units don't convert)
function swapFactor(sw, qty, unit, name) {
  if (!(qty > 0)) return null;
  const [bq, bu] = sw.for;
  if (normUnit(unit || 'ea.') === normUnit(bu)) return qty / bq;
  const c = typeof convertAmount === 'function' ? convertAmount(qty, unit, bu, name) : null;
  return c ? c.qty / bq : null;
}
function swapAmount(q) { return typeof fmt === 'function' ? fmt(Math.round(q * 100) / 100) : String(Math.round(q * 100) / 100) }
function swapPartsText(parts, factor) {
  const unitText = (u, n) => u === 'ea.' ? '' : ['cup', 'pint', 'quart', 'gallon'].includes(u) && n > 1 && typeof pluralWord === 'function' ? pluralWord(u, n) + ' ' : u + ' ';
  return parts.map(([q, u, n]) => { const amt = factor != null ? q * factor : q; return `${swapAmount(amt)} ${unitText(u, amt)}${swapPartName(n)}` }).join(' + ');
}
function hasPantry(n) { const k = ingredientKey(swapPartName(n)); return Number(state.pantry?.[k]?.qty || 0) > 0 }

// recipe page: ⇄ next to ingredients that have swaps
function swapButtonHTML(rid, ix) {
  const i = state.data.recipes[rid]?.ingredients?.[ix]; if (!i || !swapsFor(i.name)) return '';
  return `<button class="btn ghost swap-btn" aria-label="Swaps for ${esc(i.name)}" onclick="event.stopPropagation();openSwaps(decodeURIComponent('${encId(rid)}'),${ix})">⇄ Swap</button>`;
}
function openSwaps(rid, ix) {
  const r = state.data.recipes[rid], i = r?.ingredients?.[ix]; if (!i) return;
  const servings = num(document.getElementById('detailServings')?.value) || r.baseServings, scale = servings / r.baseServings;
  const q = num(i.qty), qty = q != null ? q * scale : null, sw = swapsFor(i.name), factor = swapFactor(sw, qty, i.unit, i.name);
  window.swapContext = { rid, ix, factor: q != null ? swapFactor(sw, q, i.unit, i.name) : null };
  openModal(`<div class="row between"><h2>Out of ${esc(i.name)}?</h2><button class="iconbtn" aria-label="Close" onclick="closeModal()">✕</button></div>
    <p class="small muted">${qty != null ? `The recipe uses <b>${swapAmount(qty)} ${esc(i.unit || '')}</b>${scale !== 1 ? ' for ' + servings + ' servings' : ''}. ` : ''}${factor == null ? `Amounts below are for ${swapAmount(sw.for[0])} ${esc(sw.for[1])} of ${esc(i.name)}.` : 'Amounts are worked out for this recipe.'}</p>
    <div class="swap-list">${sw.options.map((o, n) => `<div class="swap"><b>${esc(swapPartsText(o.parts, factor))}</b>${o.parts.some(p => hasPantry(p[2])) ? ' <span class="pill">🏠 in pantry</span>' : ''}${o.note ? `<div class="small muted">${esc(o.note)}</div>` : ''}
      <div class="actions"><button class="btn secondary" onclick="applySwap(${n})">Use in this recipe</button></div></div>`).join('')}</div>
    <p class="tiny muted">“Use in this recipe” changes the saved recipe. You can switch it back any time in Edit.</p>`);
}
async function applySwap(n) {
  const c = window.swapContext, r = state.data.recipes[c?.rid], i = r?.ingredients?.[c.ix]; if (!i) return;
  const o = swapsFor(i.name).options[n], f = c.factor ?? 1;
  if (c.factor == null && !await ask(`The recipe's amount of ${i.name} couldn't be converted, so the swap uses the standard amounts. Check them afterwards in Edit.`, { ok: 'Use swap' })) return;
  const rows = o.parts.map(([q, u, nm]) => { const name = swapPartName(nm), pk = getPackage(name); return { name, qty: Math.round(q * f * 1000) / 1000, unit: u, note: `instead of ${i.name}`, container: pk?.label || '', containerSize: pk ? Number(pk.qty) || null : null, fraction: null, catalog: null, auditStatus: null } });
  if (typeof convertedForSave === 'function') rows.forEach(x => { const cv = convertedForSave(x); if (cv) x.converted = cv });
  r.ingredients.splice(c.ix, 1, ...rows); save(); closeModal();
  if (typeof openRecipe === 'function') openRecipe(c.rid);
  toast('✓ Swapped ' + i.name + ' for ' + rows.map(x => x.name).join(' + '));
}
// shopping list: show swaps inside an item's details
function shopSwapsHTML(key) {
  const sw = swapsFor(key); if (!sw) return '';
  return `<details class="shop-swaps"><summary class="small">⇄ Can't find it? Swaps</summary><div class="small">${sw.options.map(o => `<div>• ${esc(swapPartsText(o.parts, null))} <span class="muted">for ${swapAmount(sw.for[0])} ${esc(sw.for[1])}${o.note ? ' — ' + esc(o.note) : ''}</span></div>`).join('')}</div></details>`;
}
