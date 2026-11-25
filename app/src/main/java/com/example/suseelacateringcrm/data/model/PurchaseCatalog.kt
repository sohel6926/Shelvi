package com.example.suseelacateringcrm.data.model

data class MasterItem(
    val name: String,
    val category: String,
    val module: String,
    val units: List<String> = PURCHASE_UNITS,
)

/** Full list of purchase units offered when an item doesn't specify a narrower set. */
val PURCHASE_UNITS = listOf(
    "Kg", "Gram", "Litre", "ML", "Packet", "Box", "Bag", "Tin", "Bottle", "Piece", "Bundle", "Dozen",
    "Crate", "Tray", "Can", "Cylinder", "Block",
)

private val WEIGHT_UNITS = listOf("Kg", "Gram")
private val LIQUID_UNITS = listOf("Litre", "ML", "Bottle")
private val LEAFY_UNITS = listOf("Kg", "Bundle")

val PAYMENT_METHODS = listOf("Cash", "UPI", "Card", "Bank Transfer", "Credit")
val PAYMENT_STATUSES = listOf("Paid", "Pending", "Partial")

/** All 8 purchase folders — used to drive the Purchases home screen and any module-wide lookups. */
object PurchaseModules {
    const val KIRANA = "Kirana"
    const val VEGETABLES = "Kayagoralu"
    const val DISPOSABLES = "Disposables"
    const val FRUITS = "Fruits"
    const val NON_VEG = "Non-Veg"
    const val GAS_FUEL = "Gas / Fuel"
    const val WATER_ICE = "Water / Ice"
    const val OTHER = "Other Items"
}

object KiranaCatalog {
    const val MODULE = PurchaseModules.KIRANA

    private val raw: Map<String, Pair<List<String>, List<String>>> = linkedMapOf(
        "Pappulu" to (listOf(
            "Kandi Pappu", "Pesara Pappu", "Minapa Pappu", "Senaga Pappu", "Putnala Pappu", "Pesalu",
            "Minumulu", "Senagalu", "Tella Senagalu / Kabuli Senagalu", "Alasandalu", "Ulavalu", "Rajma",
            "Bataneelu", "Tella Bataneelu",
        ) to WEIGHT_UNITS),
        "Biyyam / Rice" to (listOf(
            "Sona Masoori Biyyam", "HMT Biyyam", "Basmati Biyyam", "Biyyam Ravva", "Idly Ravva", "Atukulu",
        ) to WEIGHT_UNITS),
        "Pindi / Ravvalu" to (listOf(
            "Godhuma Pindi", "Maida", "Senaga Pindi", "Biyyam Pindi", "Corn Flour", "Bombay Ravva",
            "Sanna Ravva", "Ragi Pindi",
        ) to WEIGHT_UNITS),
        "Noonelu / Neyyi" to (listOf(
            "Sunflower Noone", "Palm Oil", "Nuvvula Noone", "Kobbari Noone", "Aava Noone",
            "Verusenaga Noone", "Dalda", "Neyyi",
        ) to LIQUID_UNITS),
        "Uppu / Panchadara / Bellam" to (listOf(
            "Uppu", "Ralla Uppu", "Panchadara", "Bellam", "Bellam Podi", "Thaati Bellam",
        ) to WEIGHT_UNITS),
        "Popu Dinusulu" to (listOf(
            "Aavalu", "Jeelakarra", "Menthulu", "Dhaniyalu", "Vaamu", "Sompu", "Miriyalu", "Nuvvulu", "Gasagasalu",
        ) to WEIGHT_UNITS),
        "Masala Dinusulu" to (listOf(
            "Lavangalu", "Dalchina Chekka", "Yelakulu", "Pedda Yelakulu", "Biryani Aaku", "Anasa Puvvu",
            "Japatri", "Jajikaya", "Shajeera", "Rathi Puvvu", "Endu Mirapakayalu", "Thoka Miriyalu",
        ) to WEIGHT_UNITS),
        "Podulu / Masalalu" to (listOf(
            "Karam", "Pasupu", "Dhaniyala Podi", "Jeelakarra Podi", "Miriyala Podi", "Garam Masala",
            "Inguva", "Sambar Podi", "Rasam Podi", "Biryani Masala", "Chicken Masala", "Mutton Masala",
            "Paneer Masala", "Chaat Masala", "Kasuri Methi", "Chole Masala",
        ) to (WEIGHT_UNITS + "Packet")),
        "Pulupu Items" to (listOf(
            "Chintapandu", "Nimmuppu", "Vinegar", "Amchur Podi",
        ) to (WEIGHT_UNITS + LIQUID_UNITS)),
        "Dry Fruits" to (listOf(
            "Jeedi Pappu", "Badam Pappu", "Pista", "Kismis", "Nalla Kismis", "Kharjuram", "Endu Kharjuram",
            "Endu Kobbari", "Kobbari Mukkalu", "Kunkuma Puvvu",
        ) to WEIGHT_UNITS),
        "Tiffin Items" to (listOf(
            "Semiya", "Saggubiyyam", "Verusenagalu", "Dosa Kotta Biyyam",
        ) to WEIGHT_UNITS),
        "Kirana Miscellaneous" to (listOf(
            "Appadalu", "Vadiyalu", "Majjiga Mirapakayalu", "Mamidi Ooragaya", "Nimmakaya Ooragaya",
            "Gongura Ooragaya", "Kobbari Podi", "Allam Vellulli Paste", "Tomato Puree", "Bread Podi",
            "Vanta Soda", "Yellow Food Colour", "Red Food Colour", "Green Food Colour", "Orange Food Colour",
            "Pineapple Essence", "Fried Onions",
        ) to (WEIGHT_UNITS + "Packet" + "Bottle")),
        "Bakery / Chinese / Special Items" to (listOf(
            "Cooking Soda", "Baking Powder", "Yeast", "Custard Powder", "Condensed Milk",
            "Double Ka Meetha Bread", "Soya Sauce", "Chilli Sauce", "Tomato Sauce", "Schezwan Sauce",
            "Mayonnaise", "Ajinomoto", "Noodles", "Sev", "Boondi", "Papdi", "Dry Coconut Powder", "Peanuts",
        ) to (WEIGHT_UNITS + "Packet" + "Bottle")),
        "Tea / Coffee" to (listOf(
            "Tea Powder", "Coffee Powder", "Milk Powder", "Dairy Whitener",
        ) to (WEIGHT_UNITS + "Packet")),
        "Welcome Drink Items" to (listOf(
            "Rose Syrup", "Badam Syrup", "Lemon Syrup", "Sabja Ginjalu", "Glucose Powder", "Fruit Crush",
            "Pineapple Crush", "Mango Crush", "Orange Crush", "Squash",
        ) to (LIQUID_UNITS + "Kg")),
    )

    val categories: List<String> = raw.keys.toList()

    val items: List<MasterItem> = raw.flatMap { (category, pair) ->
        val (names, units) = pair
        names.map { MasterItem(name = it, category = category, module = MODULE, units = units) }
    }
}

object VegetableCatalog {
    const val MODULE = PurchaseModules.VEGETABLES

    private val raw: Map<String, Pair<List<String>, List<String>>> = linkedMapOf(
        "Regular Kayagoralu" to (listOf(
            "Ullipayalu", "Tomatalu", "Bangala Dumpalu", "Vankayalu", "Bendakayalu", "Beerakayalu",
            "Nethi Beerakaya", "Sorakayalu", "Potlakayalu", "Kakarakayalu", "Dondakayalu", "Dosakayalu",
            "Budida Gummadikaya", "Gummadikaya", "Mullangi", "Carrot", "Beetroot", "Capsicum", "Cabbage",
            "Cauliflower", "Beans", "Green Peas", "Sweet Corn", "Baby Corn", "Mushroom",
        ) to listOf("Kg")),
        "Aaku Kooralu" to (listOf(
            "Palakura", "Thotakura", "Gongura", "Menthikura", "Kothimeera", "Pudina", "Curry Leaves",
            "Chukkakura", "Bachalikura", "Munagaku",
        ) to LEAFY_UNITS),
        "Roots / Dumpalu" to (listOf(
            "Chilakada Dumpa", "Kanda Gadda", "Chama Dumpa", "Pendalam", "Allam", "Vellulli",
        ) to listOf("Kg")),
        "Mirapakayalu" to (listOf(
            "Pachi Mirapakayalu", "Bajji Mirapakayalu", "Red Capsicum", "Yellow Capsicum", "Green Capsicum",
        ) to listOf("Kg")),
        "Vankaya Rakaalu" to (listOf(
            "Nalla Vankaya", "Tella Vankaya", "Gutti Vankaya", "Podugu Vankaya", "Banda Vankaya",
        ) to listOf("Kg")),
        "Beans" to (listOf(
            "French Beans", "Cluster Beans / Goruchikkudu", "Chikkudukaya", "Alasanda Kayalu", "Broad Beans",
        ) to listOf("Kg")),
        "South Indian Special" to (listOf(
            "Munagakaya", "Aratikaya", "Panasa Pottu", "Mamidikaya",
        ) to listOf("Kg", "Piece")),
        "North Indian / Chinese" to (listOf(
            "Broccoli", "Spring Onion", "Celery", "Lettuce",
        ) to listOf("Kg", "Bundle")),
        "Salad Items" to (listOf(
            "Cucumber",
        ) to listOf("Kg")),
    )

    val categories: List<String> = raw.keys.toList()

    val items: List<MasterItem> = raw.flatMap { (category, pair) ->
        val (names, units) = pair
        names.map { MasterItem(name = it, category = category, module = MODULE, units = units) }
    }
}

object DisposablesCatalog {
    const val MODULE = PurchaseModules.DISPOSABLES

    private val raw: Map<String, Pair<List<String>, List<String>>> = linkedMapOf(
        "Serving & Packing" to (listOf(
            "Paper Plates", "Paper Bowls", "Paper Glasses", "Plastic Glasses", "Tea Cups", "Water Glasses",
            "Spoons", "Forks", "Disposable Containers", "Parcel Boxes", "Food Packing Covers",
            "Aluminium Containers", "Garbage Bags", "Ice Cream Cups", "Plastic Covers", "Carry Covers",
            "Packing Covers", "Zip Lock Covers", "Disposable Gloves",
        ) to listOf("Packet", "Box", "Piece")),
        "Kitchen Utility" to (listOf(
            "Aluminium Foil", "Butter Paper", "Cling Wrap", "Tissue Papers", "Paper Napkins",
            "Tissue Rolls", "Kitchen Rolls",
        ) to listOf("Packet", "Box", "Piece")),
    )

    val categories: List<String> = raw.keys.toList()

    val items: List<MasterItem> = raw.flatMap { (category, pair) ->
        val (names, units) = pair
        names.map { MasterItem(name = it, category = category, module = MODULE, units = units) }
    }
}

object FruitsCatalog {
    const val MODULE = PurchaseModules.FRUITS

    private val names = listOf(
        "Aratipandlu", "Apple", "Orange", "Mosambi", "Grapes", "Pomegranate", "Papaya", "Pineapple",
        "Watermelon", "Muskmelon", "Mango", "Guava", "Sapota", "Custard Apple", "Kiwi", "Dragon Fruit",
        "Pear", "Strawberry", "Cherries", "Plums", "Peach", "Green Grapes", "Black Grapes", "Seedless Grapes",
        "Anjeer Fresh", "Dates Fresh", "Tender Coconut", "Lemon", "Amla", "Avocado",
    )
    private val units = listOf("Kg", "Piece", "Dozen")

    val categories: List<String> = listOf("Fruits")

    val items: List<MasterItem> = names.map { MasterItem(name = it, category = "Fruits", module = MODULE, units = units) }
}

object NonVegCatalog {
    const val MODULE = PurchaseModules.NON_VEG

    private val raw: Map<String, Pair<List<String>, List<String>>> = linkedMapOf(
        "Chicken" to (listOf(
            "Whole Chicken", "Chicken Curry Cut", "Chicken Biryani Cut", "Chicken Boneless", "Chicken Breast",
            "Chicken Leg Pieces", "Chicken Wings", "Chicken Drumsticks", "Chicken Liver", "Chicken Gizzard",
            "Chicken Keema", "Natu Kodi", "Natu Kodi Curry Cut",
        ) to listOf("Kg", "Piece")),
        "Mutton" to (listOf(
            "Mutton Curry Cut", "Mutton Biryani Cut", "Mutton Boneless", "Mutton With Bone", "Mutton Keema",
            "Mutton Liver", "Mutton Brain", "Mutton Paya", "Mutton Head", "Mutton Boti", "Mutton Chops",
            "Mutton Ribs",
        ) to listOf("Kg", "Piece")),
        "Fish" to (listOf(
            "Rohu Fish", "Katla Fish", "Korameenu", "Bommidala Chepa", "Vanjaram", "Apollo Fish", "Tilapia",
            "Pomfret", "Bangda", "Sardine", "Tuna", "Salmon", "Fish Curry Cut", "Fish Fry Cut",
            "Fish Boneless", "Fish Fillet",
        ) to listOf("Kg", "Piece")),
        "Seafood" to (listOf(
            "Royyalu / Prawns", "Small Prawns", "Medium Prawns", "Large Prawns", "Tiger Prawns", "Crab",
            "Squid", "Lobster",
        ) to listOf("Kg", "Piece")),
        "Eggs" to (listOf(
            "Kodi Gudlu", "White Eggs", "Brown Eggs", "Natu Kodi Gudlu", "Quail Eggs",
        ) to listOf("Piece", "Dozen", "Tray")),
    )

    val categories: List<String> = raw.keys.toList()

    val items: List<MasterItem> = raw.flatMap { (category, pair) ->
        val (names, units) = pair
        names.map { MasterItem(name = it, category = category, module = MODULE, units = units) }
    }
}

object GasFuelCatalog {
    const val MODULE = PurchaseModules.GAS_FUEL

    private val itemUnits: Map<String, List<String>> = linkedMapOf(
        "Commercial Gas Cylinder" to listOf("Cylinder"),
        "Domestic Gas Cylinder" to listOf("Cylinder"),
        "LPG Refill" to listOf("Cylinder"),
        "Gas Cylinder Deposit" to listOf("Cylinder"),
        "Gas Regulator" to listOf("Piece"),
        "Gas Pipe" to listOf("Piece"),
        "Gas Stove Lighter" to listOf("Piece"),
        "Charcoal" to listOf("Bag", "Kg"),
        "Firewood" to listOf("Bundle", "Kg"),
        "Coal" to listOf("Bag", "Kg"),
        "Kerosene" to listOf("Can", "Litre"),
        "Generator Diesel" to listOf("Litre"),
        "Generator Petrol" to listOf("Litre"),
        "Portable Gas Canister" to listOf("Piece"),
    )

    val categories: List<String> = listOf("Gas / Fuel")

    val items: List<MasterItem> = itemUnits.map { (name, units) ->
        MasterItem(name = name, category = "Gas / Fuel", module = MODULE, units = units)
    }
}

object WaterIceCatalog {
    const val MODULE = PurchaseModules.WATER_ICE

    private val itemUnits: Map<String, List<String>> = linkedMapOf(
        "Drinking Water Can 20 Litre" to listOf("Can"),
        "Drinking Water Can 10 Litre" to listOf("Can"),
        "Mineral Water Bottle 250 ML" to listOf("Bottle", "Box"),
        "Mineral Water Bottle 500 ML" to listOf("Bottle", "Box"),
        "Mineral Water Bottle 1 Litre" to listOf("Bottle", "Box"),
        "Mineral Water Bottle 2 Litre" to listOf("Bottle", "Box"),
        "Water Pouch" to listOf("Packet", "Piece"),
        "RO Water" to listOf("Litre"),
        "Tanker Water" to listOf("Litre"),
        "Ice Cubes" to listOf("Kg", "Bag"),
        "Ice Blocks" to listOf("Block"),
        "Crushed Ice" to listOf("Kg", "Bag"),
        "Ice Bags" to listOf("Bag"),
        "Soda Bottles" to listOf("Bottle", "Box"),
        "Club Soda" to listOf("Bottle", "Box"),
    )

    val categories: List<String> = listOf("Water / Ice")

    val items: List<MasterItem> = itemUnits.map { (name, units) ->
        MasterItem(name = name, category = "Water / Ice", module = MODULE, units = units)
    }
}

/** Every static (hardcoded) master catalog — excludes the Firestore-backed "Other Items" module. */
object AllPurchaseCatalogs {
    val all: List<MasterItem> =
        KiranaCatalog.items + VegetableCatalog.items + DisposablesCatalog.items + FruitsCatalog.items +
            NonVegCatalog.items + GasFuelCatalog.items + WaterIceCatalog.items
}
