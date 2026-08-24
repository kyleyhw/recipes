/**
 * The interface, in four languages.
 *
 * ## What is translated, and what is not
 *
 * **The interface is. The recipes are not.** A recipe is a Markdown file
 * someone wrote; its title, its ingredient lines and its method are content,
 * not strings, and machine-translating a method is exactly how a step stops
 * being unambiguous. Translating the recipes themselves means writing them
 * again in another language and committing those files, which is a decision
 * about the collection rather than about this table.
 *
 * So switching to Russian gives you Russian headings, controls, macro labels
 * and explanations, around a recipe still written in the language it was
 * written in. That is the honest half of the job, and it is the half that can
 * be done well.
 *
 * ## Why English is the shape of the type
 *
 * `Dict` is inferred from the English table, so every other language must
 * supply exactly the same keys — a missing translation is a compile error
 * rather than a word that silently stays in English on one screen in one
 * language, which is the failure nobody ever notices until a user does.
 */

export const LANGUAGES = [
  // Endonyms, deliberately: someone looking for Russian scans the list for
  // "Русский", not for "Russian" spelled in a language they are leaving.
  { code: "en", label: "English" },
  { code: "zh-Hant", label: "繁體中文" },
  { code: "zh-Hans", label: "简体中文" },
  { code: "ru", label: "Русский" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

export const LANGUAGE_CODES: readonly Language[] = LANGUAGES.map((l) => l.code);

export function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGE_CODES as readonly string[]).includes(value);
}

const en = {
  // Chrome
  all: "All",
  about: "About",
  ingredients: "Ingredients",
  source: "Source",
  language: "Language",
  light: "Light",
  dark: "Dark",
  toLight: "Switch to the light theme",
  toDark: "Switch to the dark theme",
  footerNote: "Macros are computed for export, not tracked here. One file per recipe.",

  // Browsing
  searchPlaceholder: "Search titles, ingredients and tags",
  searchLabel: "Search recipes",
  sort: "Sort",
  sortLabel: "Arrange recipes by",
  clear: "Clear",
  resultsFor: "{n} result(s) for “{q}”",
  nothingMatched:
    "Nothing matched. Search covers titles, descriptions, cuisines, tags and ingredient lines.",
  unattributed: "Unattributed",
  noRecipes: "No recipes yet",
  noRecipesNote:
    "Recipes are Markdown files in content/recipes/. Add one and push; the site rebuilds itself.",
  seeLibrary: "See the ingredient library",

  // Arrangements
  sortCategory: "Category",
  sortCuisine: "Cuisine",
  sortAlphabetical: "A–Z",
  sortQuickest: "Quickest first",
  sortLongest: "Longest first",
  sortProtein: "Most protein",
  sortLeastProtein: "Least protein",
  sortReverseAlphabetical: "Z–A",
  sortAddedBy: "Added by",
  sortRecentlyAdded: "Recently added",
  sortOldest: "Oldest first",
  sortRecentlyEdited: "Recently edited",
  sortLongestUntouched: "Longest untouched",
  filterShowAll: "All",

  // A recipe
  method: "Method",
  notes: "Notes",
  storage: "Storage and reheating",
  log: "Log",
  draftBanner: "Draft — not yet cooked here",
  draft: "draft",
  minPrep: "{d} prep",
  minCook: "{d} {label}",
  minTotal: "{d} total",
  durMin: "{n} min",
  durHr: "{n} h",
  durHrMin: "{h} h {m} min",
  from: "From",
  photoBy: "Photo",
  oneFile: "This recipe is one file.",
  readIt: "Read it",
  editIt: "edit it",
  orSee: ", or see",
  history: "everything it has ever been",
  addedBy: "Added by {who} on {date}.",
  editedBy: "Edited since by {who}.",
  listAnd: "and",
  exportLabel: "Export",
  forTracker: "For a tracker",

  // Scaling
  fewerServings: "Fewer servings",
  moreServings: "More servings",
  reset: "Default",
  writtenForTin: "Written for a {tin}",
  tinDepth: ", {n} cm deep",
  iHaveA: "I have a",
  tinSelectLabel: "The tin you are baking in",
  asWritten: "{tin} (as written)",
  notScaled: "(not scaled)",
  notScaledTitle: "Excluded from scaling — multiplying it would produce a wrong amount",

  yourTin: "The tin you have",
  tinShape: "Shape",
  tinRound: "Round",
  tinSquare: "Square",
  tinRectangular: "Rectangular",
  tinLoaf: "Loaf",
  tinDiameter: "Diameter",
  tinLength: "Length",
  tinWidth: "Width",
  tinDepthLabel: "Depth",
  tinSide: "Side",
  tinCm: "cm",
  tinAsWritten: "As written",

  // Nutrition
  perServing: "Per {label}",
  massCovered: "{n}% of mass covered",
  massCoveredTitle: "Share of the recipe's determinable mass that carries nutrition data",
  ofADay: "{n}% of a 2000 kcal day",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  pctEnergy: "{n}% energy",
  vitaminsAndMinerals: "Vitamins and minerals",
  knownOf: "({a} of {b} known)",
  noData: "no data",
  pctOfMass: "{n}% of mass",
  pctOfMassTitle: "Share of the recipe's mass carrying a figure for this nutrient",
  referenceIntake: "% RI",
  referenceNote:
    "RI is the daily reference intake for an average adult, from the same schedule used on food labelling in Britain and the EU. It is there for scale, not as a target. A percentage next to a figure drawn from part of the recipe is that part’s percentage, and the mass share says which.",
  barNote:
    "The bar shows where the energy comes from, not the mass — fat carries 9 kcal per gram against 4 for protein and carbohydrate, so equal weights are not equal calories.",
  noNutritionYet:
    "No nutrition data yet. Resolve the ingredients below, or add them to the ingredient library by hand.",
  lowerBound:
    "These figures cover {n}% of the recipe by mass. Treat them as a lower bound.",
  gapUnresolved: "mass known, no nutrition data",
  gapMassUnknown:
    "{n} ingredient(s) whose weight cannot be determined, so excluded from the coverage figure entirely",
  gapNoQuantity: "{n} ingredient(s) with no stated amount",
  gapsAreRows:
    "Every gap here is a missing row in content/ingredients.json, not a limit of the arithmetic. Add the ingredient and the figures complete themselves.",
  proteinPerServing: "{n} g protein per serving",
  proteinUnknown: "protein unknown",
  pctCovered: "({n}% covered)",

  // The diagram
  diagram: "Diagram",
  diagramCaption:
    "The recipe as a tree: ingredients on the left, and the operations that combine them to the right.",
  diagramNote:
    "Each operation stands as tall as the ingredients it takes in. Read left to right.",

  // The ingredient library
  findIngredient: "Find an ingredient",
  keeping: "Keeping",
  keepingUnused: "What you did not use",
  fullPage: "Full page",
  close: "Close",
  closeLibrary: "Close the ingredient library",
  per100Note:
    "Per 100 g, shared by every recipe — so a correction here fixes every recipe at once.",
  noIngredientMatched:
    "Nothing matched. Ingredients are added by editing content/ingredients.json.",
  madeUp: "From a packet",
  madeUpRate: "1 {unit} to {ml} ml of water.",
  madeUpLine: "{n} in {amount} of water",
  usedIn: "Used in {n} recipe(s)",
  usedInNothing: "Nothing uses this.",
  approximately: "about {text}",
  openInLibrary: "{name} in the ingredient library",

  // Categories the collection ships with. A category not listed here falls
  // back to the name in the file, which is the right answer for one invented
  // after this table was written.
  "category.Mains": "Mains",
  "category.Sides": "Sides",
  "category.Desserts": "Desserts",
  "category.Baked Goods": "Baked Goods",
  "category.Breakfast": "Breakfast",
  "category.Soups & Stews": "Soups & Stews",
  "category.Sauces & Condiments": "Sauces & Condiments",
  "category.Drinks": "Drinks",
  "category.Snacks": "Snacks",

  /*
   * Units, for translated ingredient lines.
   *
   * Keyed by unit rather than by label, because a label is already inflected
   * and already English — "cups" is a word, not an identifier. A translated
   * line is assembled as amount + unit + name, so this is the middle of it.
   */
  "unit.g": "g",
  "unit.kg": "kg",
  "unit.oz": "oz",
  "unit.lb": "lb",
  "unit.ml": "ml",
  "unit.l": "l",
  "unit.tsp": "tsp",
  "unit.tbsp": "tbsp",
  "unit.cup": "cup",
  "unit.floz": "fl oz",
  "unit.pint": "pint",
  "unit.quart": "quart",
  "unit.gallon": "gallon",
  "unit.clove": "clove",
  "unit.can": "can",
  "unit.pinch": "pinch",

  // Nutrients
  "nutrient.kcal": "Energy",
  "nutrient.protein": "Protein",
  "nutrient.carbs": "Carbohydrate",
  "nutrient.sugar": "of which sugars",
  "nutrient.fiber": "Fibre",
  "nutrient.fat": "Fat",
  "nutrient.satFat": "of which saturates",
  "nutrient.cholesterolMg": "Cholesterol",
  "nutrient.sodiumMg": "Sodium",
  "nutrient.potassiumMg": "Potassium",
  "nutrient.calciumMg": "Calcium",
  "nutrient.ironMg": "Iron",
  "nutrient.magnesiumMg": "Magnesium",
  "nutrient.zincMg": "Zinc",
  "nutrient.vitaminAUg": "Vitamin A",
  "nutrient.vitaminCMg": "Vitamin C",
  "nutrient.vitaminDUg": "Vitamin D",
  "nutrient.vitaminEMg": "Vitamin E",
  "nutrient.vitaminB12Ug": "Vitamin B12",
  "nutrient.folateUg": "Folate",
} as const;

export type StringKey = keyof typeof en;
type Dict = Record<StringKey, string>;

const zhHant: Dict = {
  all: "全部",
  about: "關於",
  ingredients: "食材",
  source: "原始碼",
  language: "語言",
  light: "淺色",
  dark: "深色",
  toLight: "切換為淺色主題",
  toDark: "切換為深色主題",
  footerNote: "營養素是為了匯出而計算，本站不做記錄。每道食譜一個檔案。",

  searchPlaceholder: "搜尋標題、食材與標籤",
  searchLabel: "搜尋食譜",
  sort: "排序",
  sortLabel: "食譜排列方式",
  clear: "清除",
  resultsFor: "「{q}」的 {n} 筆結果",
  nothingMatched: "沒有符合的結果。搜尋涵蓋標題、說明、菜系、標籤與食材行。",
  unattributed: "未註明",
  noRecipes: "尚無食譜",
  noRecipesNote:
    "食譜是 content/recipes/ 裡的 Markdown 檔案。新增一個並推送，網站會自行重建。",
  seeLibrary: "查看食材庫",

  sortCategory: "分類",
  sortCuisine: "菜系",
  sortAlphabetical: "字母順序",
  sortQuickest: "最快優先",
  sortLongest: "最久優先",
  sortProtein: "蛋白質最高",
  sortLeastProtein: "蛋白質最低",
  sortReverseAlphabetical: "Z–A",
  sortAddedBy: "新增者",
  sortRecentlyAdded: "最近新增",
  sortOldest: "最早新增",
  sortRecentlyEdited: "最近修改",
  sortLongestUntouched: "最久未動",
  filterShowAll: "全部",

  method: "做法",
  notes: "筆記",
  storage: "保存與復熱",
  log: "紀錄",
  draftBanner: "草稿 — 尚未做過",
  draft: "草稿",
  minPrep: "準備 {d}",
  minCook: "{label} {d}",
  minTotal: "共 {d}",
  durMin: "{n} 分鐘",
  durHr: "{n} 小時",
  durHrMin: "{h} 小時 {m} 分鐘",
  from: "來源",
  photoBy: "照片",
  oneFile: "這道食譜就是一個檔案。",
  readIt: "閱讀",
  editIt: "編輯",
  orSee: "，或",
  history: "查看它的所有歷史版本",
  addedBy: "由 {who} 於 {date} 加入。",
  editedBy: "之後由 {who} 修改。",
  listAnd: "和",
  exportLabel: "匯出",
  forTracker: "給記錄工具",

  fewerServings: "減少份數",
  moreServings: "增加份數",
  reset: "預設份量",
  writtenForTin: "依 {tin} 撰寫",
  tinDepth: "，深 {n} 公分",
  iHaveA: "我有的是",
  tinSelectLabel: "你使用的烤模",
  asWritten: "{tin}（原始尺寸）",
  notScaled: "（未換算）",
  notScaledTitle: "不參與換算 — 按比例乘算會得出錯誤的用量",

  yourTin: "你有的烤模",
  tinShape: "形狀",
  tinRound: "圓形",
  tinSquare: "正方形",
  tinRectangular: "長方形",
  tinLoaf: "長條模",
  tinDiameter: "直徑",
  tinLength: "長",
  tinWidth: "寬",
  tinDepthLabel: "深",
  tinSide: "邊長",
  tinCm: "公分",
  tinAsWritten: "照原始尺寸",

  perServing: "每{label}",
  massCovered: "涵蓋 {n}% 的重量",
  massCoveredTitle: "食譜中可判定重量裡，具備營養資料的比例",
  ofADay: "每日 2000 大卡的 {n}%",
  protein: "蛋白質",
  carbs: "碳水化合物",
  fat: "脂肪",
  pctEnergy: "熱量佔 {n}%",
  vitaminsAndMinerals: "維生素與礦物質",
  knownOf: "（已知 {a}／{b}）",
  noData: "無資料",
  pctOfMass: "佔重量 {n}%",
  pctOfMassTitle: "食譜重量中，具備此營養素數值的比例",
  referenceIntake: "% NRV",
  referenceNote:
    "NRV 是成人每日參考攝取量，採用英國與歐盟食品標示的同一套數值。它只是用來衡量規模，並非目標。若數值僅來自食譜的一部分，百分比也只代表那一部分，重量比例會標明是多少。",
  barNote:
    "長條顯示熱量的來源，而不是重量 — 脂肪每公克 9 大卡，蛋白質與碳水化合物則是 4 大卡，所以同樣的重量不等於同樣的熱量。",
  noNutritionYet: "尚無營養資料。請比對下方食材，或手動加入食材庫。",
  lowerBound: "這些數值涵蓋食譜 {n}% 的重量，請視為下限。",
  gapUnresolved: "已知重量，但沒有營養資料",
  gapMassUnknown: "有 {n} 項食材無法判定重量，因此完全不計入涵蓋率",
  gapNoQuantity: "有 {n} 項食材沒有標示用量",
  gapsAreRows:
    "這裡的每一個缺口都是 content/ingredients.json 少了一列，而不是計算方式的限制。補上食材，數字就會自己完整。",
  proteinPerServing: "每份 {n} 公克蛋白質",
  proteinUnknown: "蛋白質未知",
  pctCovered: "（涵蓋 {n}%）",

  diagram: "流程圖",
  diagramCaption: "食譜的樹狀圖：左邊是食材，右邊是把它們合併起來的步驟。",
  diagramNote: "每個步驟的高度，就是它所用到的食材範圍。由左往右讀。",

  findIngredient: "尋找食材",
  keeping: "保存",
  keepingUnused: "沒用完的食材",
  fullPage: "完整頁面",
  close: "關閉",
  closeLibrary: "關閉食材庫",
  per100Note: "以每 100 公克計，所有食譜共用 — 在這裡更正一次，全部食譜同時修正。",
  noIngredientMatched: "沒有符合的結果。食材請透過編輯 content/ingredients.json 新增。",
  madeUp: "沖泡方式",
  madeUpRate: "1 {unit} 兌 {ml} 毫升水。",
  madeUpLine: "{n}，加 {amount} 水",
  usedIn: "{n} 道食譜用到",
  usedInNothing: "目前沒有食譜用到。",
  approximately: "約 {text}",
  openInLibrary: "在食材庫中查看{name}",

  "category.Mains": "主菜",
  "category.Sides": "配菜",
  "category.Desserts": "甜點",
  "category.Baked Goods": "烘焙",
  "category.Breakfast": "早餐",
  "category.Soups & Stews": "湯與燉菜",
  "category.Sauces & Condiments": "醬料與調味",
  "category.Drinks": "飲品",
  "category.Snacks": "點心",

  "unit.g": "公克",
  "unit.kg": "公斤",
  "unit.oz": "盎司",
  "unit.lb": "磅",
  "unit.ml": "毫升",
  "unit.l": "公升",
  "unit.tsp": "小匙",
  "unit.tbsp": "大匙",
  "unit.cup": "杯",
  "unit.floz": "液盎司",
  "unit.pint": "品脫",
  "unit.quart": "夸脫",
  "unit.gallon": "加侖",
  "unit.clove": "瓣",
  "unit.can": "罐",
  "unit.pinch": "撮",

  "nutrient.kcal": "熱量",
  "nutrient.protein": "蛋白質",
  "nutrient.carbs": "碳水化合物",
  "nutrient.sugar": "其中糖",
  "nutrient.fiber": "膳食纖維",
  "nutrient.fat": "脂肪",
  "nutrient.satFat": "其中飽和脂肪",
  "nutrient.cholesterolMg": "膽固醇",
  "nutrient.sodiumMg": "鈉",
  "nutrient.potassiumMg": "鉀",
  "nutrient.calciumMg": "鈣",
  "nutrient.ironMg": "鐵",
  "nutrient.magnesiumMg": "鎂",
  "nutrient.zincMg": "鋅",
  "nutrient.vitaminAUg": "維生素 A",
  "nutrient.vitaminCMg": "維生素 C",
  "nutrient.vitaminDUg": "維生素 D",
  "nutrient.vitaminEMg": "維生素 E",
  "nutrient.vitaminB12Ug": "維生素 B12",
  "nutrient.folateUg": "葉酸",
};

const zhHans: Dict = {
  all: "全部",
  about: "关于",
  ingredients: "食材",
  source: "源代码",
  language: "语言",
  light: "浅色",
  dark: "深色",
  toLight: "切换为浅色主题",
  toDark: "切换为深色主题",
  footerNote: "营养素是为了导出而计算，本站不做记录。每道食谱一个文件。",

  searchPlaceholder: "搜索标题、食材与标签",
  searchLabel: "搜索食谱",
  sort: "排序",
  sortLabel: "食谱排列方式",
  clear: "清除",
  resultsFor: "“{q}”的 {n} 条结果",
  nothingMatched: "没有匹配的结果。搜索涵盖标题、说明、菜系、标签与食材行。",
  unattributed: "未注明",
  noRecipes: "尚无食谱",
  noRecipesNote:
    "食谱是 content/recipes/ 里的 Markdown 文件。新增一个并推送，网站会自行重建。",
  seeLibrary: "查看食材库",

  sortCategory: "分类",
  sortCuisine: "菜系",
  sortAlphabetical: "字母顺序",
  sortQuickest: "最快优先",
  sortLongest: "最久优先",
  sortProtein: "蛋白质最高",
  sortLeastProtein: "蛋白质最低",
  sortReverseAlphabetical: "Z–A",
  sortAddedBy: "添加者",
  sortRecentlyAdded: "最近新增",
  sortOldest: "最早新增",
  sortRecentlyEdited: "最近修改",
  sortLongestUntouched: "最久未动",
  filterShowAll: "全部",

  method: "做法",
  notes: "笔记",
  storage: "保存与复热",
  log: "记录",
  draftBanner: "草稿 — 尚未做过",
  draft: "草稿",
  minPrep: "准备 {d}",
  minCook: "{label} {d}",
  minTotal: "共 {d}",
  durMin: "{n} 分钟",
  durHr: "{n} 小时",
  durHrMin: "{h} 小时 {m} 分钟",
  from: "来源",
  photoBy: "照片",
  oneFile: "这道食谱就是一个文件。",
  readIt: "阅读",
  editIt: "编辑",
  orSee: "，或",
  history: "查看它的所有历史版本",
  addedBy: "由 {who} 于 {date} 添加。",
  editedBy: "之后由 {who} 修改。",
  listAnd: "和",
  exportLabel: "导出",
  forTracker: "给记录工具",

  fewerServings: "减少份数",
  moreServings: "增加份数",
  reset: "默认份量",
  writtenForTin: "按 {tin} 编写",
  tinDepth: "，深 {n} 厘米",
  iHaveA: "我有的是",
  tinSelectLabel: "你使用的烤模",
  asWritten: "{tin}（原始尺寸）",
  notScaled: "（未换算）",
  notScaledTitle: "不参与换算 — 按比例相乘会得出错误的用量",

  yourTin: "你有的烤模",
  tinShape: "形状",
  tinRound: "圆形",
  tinSquare: "正方形",
  tinRectangular: "长方形",
  tinLoaf: "长条模",
  tinDiameter: "直径",
  tinLength: "长",
  tinWidth: "宽",
  tinDepthLabel: "深",
  tinSide: "边长",
  tinCm: "厘米",
  tinAsWritten: "按原始尺寸",

  perServing: "每{label}",
  massCovered: "涵盖 {n}% 的重量",
  massCoveredTitle: "食谱中可判定重量里，具备营养数据的比例",
  ofADay: "每日 2000 千卡的 {n}%",
  protein: "蛋白质",
  carbs: "碳水化合物",
  fat: "脂肪",
  pctEnergy: "热量占 {n}%",
  vitaminsAndMinerals: "维生素与矿物质",
  knownOf: "（已知 {a}／{b}）",
  noData: "无数据",
  pctOfMass: "占重量 {n}%",
  pctOfMassTitle: "食谱重量中，具备此营养素数值的比例",
  referenceIntake: "% NRV",
  referenceNote:
    "NRV 是成人每日参考摄入量，采用英国与欧盟食品标签的同一套数值。它只是用来衡量规模，并非目标。若数值仅来自食谱的一部分，百分比也只代表那一部分，重量比例会标明是多少。",
  barNote:
    "长条显示热量的来源，而不是重量 — 脂肪每克 9 千卡，蛋白质与碳水化合物则是 4 千卡，所以同样的重量不等于同样的热量。",
  noNutritionYet: "尚无营养数据。请比对下方食材，或手动加入食材库。",
  lowerBound: "这些数值涵盖食谱 {n}% 的重量，请视为下限。",
  gapUnresolved: "已知重量，但没有营养数据",
  gapMassUnknown: "有 {n} 项食材无法判定重量，因此完全不计入覆盖率",
  gapNoQuantity: "有 {n} 项食材没有标注用量",
  gapsAreRows:
    "这里的每一个缺口都是 content/ingredients.json 少了一行，而不是计算方式的限制。补上食材，数字就会自己完整。",
  proteinPerServing: "每份 {n} 克蛋白质",
  proteinUnknown: "蛋白质未知",
  pctCovered: "（涵盖 {n}%）",

  diagram: "流程图",
  diagramCaption: "食谱的树状图：左边是食材，右边是把它们合并起来的步骤。",
  diagramNote: "每个步骤的高度，就是它所用到的食材范围。由左往右读。",

  findIngredient: "查找食材",
  keeping: "保存",
  keepingUnused: "没用完的食材",
  fullPage: "完整页面",
  close: "关闭",
  closeLibrary: "关闭食材库",
  per100Note: "以每 100 克计，所有食谱共用 — 在这里更正一次，全部食谱同时修正。",
  noIngredientMatched: "没有匹配的结果。食材请通过编辑 content/ingredients.json 新增。",
  madeUp: "冲泡方式",
  madeUpRate: "1 {unit} 兑 {ml} 毫升水。",
  madeUpLine: "{n}，加 {amount} 水",
  usedIn: "{n} 道食谱用到",
  usedInNothing: "目前没有食谱用到。",
  approximately: "约 {text}",
  openInLibrary: "在食材库中查看{name}",

  "category.Mains": "主菜",
  "category.Sides": "配菜",
  "category.Desserts": "甜点",
  "category.Baked Goods": "烘焙",
  "category.Breakfast": "早餐",
  "category.Soups & Stews": "汤与炖菜",
  "category.Sauces & Condiments": "酱料与调味",
  "category.Drinks": "饮品",
  "category.Snacks": "点心",

  "unit.g": "克",
  "unit.kg": "千克",
  "unit.oz": "盎司",
  "unit.lb": "磅",
  "unit.ml": "毫升",
  "unit.l": "升",
  "unit.tsp": "小勺",
  "unit.tbsp": "大勺",
  "unit.cup": "杯",
  "unit.floz": "液盎司",
  "unit.pint": "品脱",
  "unit.quart": "夸脱",
  "unit.gallon": "加仑",
  "unit.clove": "瓣",
  "unit.can": "罐",
  "unit.pinch": "撮",

  "nutrient.kcal": "热量",
  "nutrient.protein": "蛋白质",
  "nutrient.carbs": "碳水化合物",
  "nutrient.sugar": "其中糖",
  "nutrient.fiber": "膳食纤维",
  "nutrient.fat": "脂肪",
  "nutrient.satFat": "其中饱和脂肪",
  "nutrient.cholesterolMg": "胆固醇",
  "nutrient.sodiumMg": "钠",
  "nutrient.potassiumMg": "钾",
  "nutrient.calciumMg": "钙",
  "nutrient.ironMg": "铁",
  "nutrient.magnesiumMg": "镁",
  "nutrient.zincMg": "锌",
  "nutrient.vitaminAUg": "维生素 A",
  "nutrient.vitaminCMg": "维生素 C",
  "nutrient.vitaminDUg": "维生素 D",
  "nutrient.vitaminEMg": "维生素 E",
  "nutrient.vitaminB12Ug": "维生素 B12",
  "nutrient.folateUg": "叶酸",
};

const ru: Dict = {
  all: "Все",
  about: "О сайте",
  ingredients: "Ингредиенты",
  source: "Исходный код",
  language: "Язык",
  light: "Светлая",
  dark: "Тёмная",
  toLight: "Переключить на светлую тему",
  toDark: "Переключить на тёмную тему",
  footerNote:
    "Макросы считаются для экспорта, а не отслеживаются здесь. Один файл на рецепт.",

  searchPlaceholder: "Поиск по названиям, ингредиентам и меткам",
  searchLabel: "Поиск рецептов",
  sort: "Сортировка",
  sortLabel: "Порядок рецептов",
  clear: "Очистить",
  resultsFor: "Результатов по запросу «{q}»: {n}",
  nothingMatched:
    "Ничего не найдено. Поиск охватывает названия, описания, кухни, метки и строки ингредиентов.",
  unattributed: "Без указания",
  noRecipes: "Рецептов пока нет",
  noRecipesNote:
    "Рецепты — это файлы Markdown в content/recipes/. Добавьте один и запушьте; сайт пересоберётся сам.",
  seeLibrary: "Открыть справочник ингредиентов",

  sortCategory: "Категория",
  sortCuisine: "Кухня",
  sortAlphabetical: "А–Я",
  sortQuickest: "Сначала быстрые",
  sortLongest: "Сначала долгие",
  sortProtein: "Больше белка",
  sortLeastProtein: "Меньше белка",
  sortReverseAlphabetical: "Я–А",
  sortAddedBy: "Кто добавил",
  sortRecentlyAdded: "Недавно добавленные",
  sortOldest: "Сначала старые",
  sortRecentlyEdited: "Недавно изменённые",
  sortLongestUntouched: "Дольше всего без правок",
  filterShowAll: "Все",

  method: "Приготовление",
  notes: "Заметки",
  storage: "Хранение и разогрев",
  log: "Журнал",
  draftBanner: "Черновик — здесь ещё не готовили",
  draft: "черновик",
  minPrep: "{d} подготовки",
  minCook: "{d} — {label}",
  minTotal: "{d} всего",
  durMin: "{n} мин",
  durHr: "{n} ч",
  durHrMin: "{h} ч {m} мин",
  from: "Источник",
  photoBy: "Фото",
  oneFile: "Этот рецепт — один файл.",
  readIt: "Открыть его",
  editIt: "изменить",
  orSee: ", или посмотреть",
  history: "всю его историю",
  addedBy: "Добавил(а) {who}, {date}.",
  editedBy: "Позже правили: {who}.",
  listAnd: "и",
  exportLabel: "Экспорт",
  forTracker: "Для трекера",

  fewerServings: "Меньше порций",
  moreServings: "Больше порций",
  reset: "По умолчанию",
  writtenForTin: "Рассчитано на {tin}",
  tinDepth: ", глубина {n} см",
  iHaveA: "У меня",
  tinSelectLabel: "Форма, в которой вы печёте",
  asWritten: "{tin} (как в рецепте)",
  notScaled: "(без пересчёта)",
  notScaledTitle: "Исключено из пересчёта — умножение дало бы неверное количество",

  yourTin: "Ваша форма",
  tinShape: "Форма",
  tinRound: "Круглая",
  tinSquare: "Квадратная",
  tinRectangular: "Прямоугольная",
  tinLoaf: "Для хлеба",
  tinDiameter: "Диаметр",
  tinLength: "Длина",
  tinWidth: "Ширина",
  tinDepthLabel: "Глубина",
  tinSide: "Сторона",
  tinCm: "см",
  tinAsWritten: "Как в рецепте",

  perServing: "На {label}",
  massCovered: "охвачено {n}% массы",
  massCoveredTitle:
    "Доля определимой массы рецепта, для которой есть данные о питательности",
  ofADay: "{n}% от 2000 ккал в день",
  protein: "Белки",
  carbs: "Углеводы",
  fat: "Жиры",
  pctEnergy: "{n}% энергии",
  vitaminsAndMinerals: "Витамины и минералы",
  knownOf: "(известно {a} из {b})",
  noData: "нет данных",
  pctOfMass: "{n}% массы",
  pctOfMassTitle: "Доля массы рецепта, для которой есть значение этого нутриента",
  referenceIntake: "% РСП",
  referenceNote:
    "РСП — рекомендуемое суточное потребление для среднего взрослого, по той же шкале, что используется в маркировке продуктов в Британии и ЕС. Она нужна для масштаба, а не как цель. Если значение получено из части рецепта, то и процент относится к этой части, а доля массы говорит, к какой именно.",
  barNote:
    "Полоса показывает, откуда берётся энергия, а не массу — жир даёт 9 ккал на грамм против 4 у белков и углеводов, поэтому равные веса не равны по калориям.",
  noNutritionYet:
    "Данных о питательности пока нет. Сопоставьте ингредиенты ниже или добавьте их в справочник вручную.",
  lowerBound: "Эти значения охватывают {n}% массы рецепта. Считайте их нижней границей.",
  gapUnresolved: "масса известна, данных о питательности нет",
  gapMassUnknown:
    "Ингредиентов, чей вес определить нельзя: {n} — они полностью исключены из охвата",
  gapNoQuantity: "Ингредиентов без указанного количества: {n}",
  gapsAreRows:
    "Каждый пробел здесь — недостающая строка в content/ingredients.json, а не предел арифметики. Добавьте ингредиент, и цифры сойдутся сами.",
  proteinPerServing: "{n} г белка на порцию",
  proteinUnknown: "белок неизвестен",
  pctCovered: "(охвачено {n}%)",

  diagram: "Схема",
  diagramCaption:
    "Рецепт как дерево: слева ингредиенты, справа операции, которые их соединяют.",
  diagramNote:
    "Высота каждой операции равна набору ингредиентов, которые в неё входят. Читается слева направо.",

  findIngredient: "Найти ингредиент",
  keeping: "Хранение",
  keepingUnused: "Что осталось от продуктов",
  fullPage: "Отдельная страница",
  close: "Закрыть",
  closeLibrary: "Закрыть справочник ингредиентов",
  per100Note:
    "На 100 г, общее для всех рецептов — исправление здесь чинит сразу все рецепты.",
  noIngredientMatched:
    "Ничего не найдено. Ингредиенты добавляются правкой content/ingredients.json.",
  madeUp: "Из пакетика",
  madeUpRate: "1 {unit} на {ml} мл воды.",
  madeUpLine: "{n} на {amount} воды",
  usedIn: "Рецептов с этим: {n}",
  usedInNothing: "Пока ни в одном рецепте.",
  approximately: "около {text}",
  openInLibrary: "{name} в справочнике ингредиентов",

  "category.Mains": "Основные блюда",
  "category.Sides": "Гарниры",
  "category.Desserts": "Десерты",
  "category.Baked Goods": "Выпечка",
  "category.Breakfast": "Завтраки",
  "category.Soups & Stews": "Супы и рагу",
  "category.Sauces & Condiments": "Соусы и приправы",
  "category.Drinks": "Напитки",
  "category.Snacks": "Закуски",

  "unit.g": "г",
  "unit.kg": "кг",
  "unit.oz": "унц.",
  "unit.lb": "фунт",
  "unit.ml": "мл",
  "unit.l": "л",
  "unit.tsp": "ч. л.",
  "unit.tbsp": "ст. л.",
  "unit.cup": "стакан",
  "unit.floz": "жидк. унц.",
  "unit.pint": "пинта",
  "unit.quart": "кварта",
  "unit.gallon": "галлон",
  "unit.clove": "зубчик",
  "unit.can": "банка",
  "unit.pinch": "щепотка",

  "nutrient.kcal": "Энергия",
  "nutrient.protein": "Белки",
  "nutrient.carbs": "Углеводы",
  "nutrient.sugar": "в том числе сахара",
  "nutrient.fiber": "Клетчатка",
  "nutrient.fat": "Жиры",
  "nutrient.satFat": "в том числе насыщенные",
  "nutrient.cholesterolMg": "Холестерин",
  "nutrient.sodiumMg": "Натрий",
  "nutrient.potassiumMg": "Калий",
  "nutrient.calciumMg": "Кальций",
  "nutrient.ironMg": "Железо",
  "nutrient.magnesiumMg": "Магний",
  "nutrient.zincMg": "Цинк",
  "nutrient.vitaminAUg": "Витамин A",
  "nutrient.vitaminCMg": "Витамин C",
  "nutrient.vitaminDUg": "Витамин D",
  "nutrient.vitaminEMg": "Витамин E",
  "nutrient.vitaminB12Ug": "Витамин B12",
  "nutrient.folateUg": "Фолат",
};

/**
 * Exported so a test can walk every table.
 *
 * The type already guarantees that each language has every key. What it cannot
 * guarantee is that a value is non-empty, or that a translation kept the
 * `{n}` its English original had — both of which produce a sentence with a
 * hole in it, in one language, on one screen.
 */
export const DICTIONARIES: Record<Language, Dict> = {
  en,
  "zh-Hant": zhHant,
  "zh-Hans": zhHans,
  ru,
};

/**
 * A category name, translated if this table knows it.
 *
 * Categories are data — a row in `content/categories.json` — so one invented
 * after this table was written has no key here. It falls back to the name in
 * the file, which is the right answer for it: the alternative is a blank
 * navigation item, or the literal string `category.Pickles`.
 */
export function translateCategory(language: Language, name: string): string {
  const key = `category.${name}`;
  return key in en ? translate(language, key as StringKey) : name;
}

/**
 * One string, with `{name}` placeholders filled in.
 *
 * `(s)` in an English string is resolved by the `n` variable: a plural rule
 * good enough for "3 results" and honest about being English-only. Chinese has
 * no plural inflection and Russian has three forms with a rule this table does
 * not attempt, so those translations are written to read correctly without one
 * — "Результатов: 3" rather than a form that must agree with the number.
 */
export function translate(
  language: Language,
  key: StringKey,
  vars?: Record<string, string | number>,
): string {
  // Falling back to English rather than to the key: an untranslated word is a
  // gap a reader can work around, and `gapMassUnknown` is not. The language
  // itself is checked too — `isLanguage` guards what goes *into* storage, but
  // storage outlives the code that wrote it, and a value from an older version
  // must degrade to English rather than throw on every string on the page.
  const table = DICTIONARIES[language] ?? DICTIONARIES.en;
  let text = table[key] || DICTIONARIES.en[key];

  // Unconditionally, not only when `vars` is given: a caller that forgets the
  // variables should get a sentence with a hole in it, not one with `{n}` in
  // it. The first reads as missing data, which it is; the second reads as a
  // broken program.
  text = text.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars && name in vars ? String(vars[name]) : "",
  );

  if (text.includes("(s)")) {
    const n = Number(vars?.["n"]);
    text = text.replace(/\(s\)/g, n === 1 ? "" : "s");
  }

  return text;
}
