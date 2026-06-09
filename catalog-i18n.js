/**
 * Salon catalog display names (CRM stores Russian in service_listings / service_categories).
 * Keys are canonical Russian names from the database.
 */
(function () {
  "use strict";

  var CATEGORIES = {
    "Брови и ресницы": { et: "Kulmud ja ripsmed", en: "Brows & lashes" },
    "Маникюр": { et: "Maniküür", en: "Manicure" },
    "Окрашивание": { et: "Juuste värvimine", en: "Hair coloring" },
    "Педикюр": { et: "Pediküür", en: "Pedicure" },
    "Стрижка": { et: "Juukselõikus", en: "Haircuts" },
    "Укладки": { et: "Soengud", en: "Styling" },
    "Химическая завивка": { et: "Keemiline lokk", en: "Perm" },
    "Сложные техники окрашивания": { et: "Keerulised värvimistehnikad", en: "Complex colouring" },
    "Татуаж": { et: "Hennamaaling", en: "Henna tattoo" },
    "Техники мелирования": { et: "Keerulised värvimistehnikad", en: "Complex colouring" },
    "Тату": { et: "Hennamaaling", en: "Henna tattoo" },
  };

  var SERVICES = {
    "Коррекция бровей": { et: "Kulmude korrigeerimine", en: "Eyebrow shaping" },
    "Окрашивание бровей": { et: "Kulmude värvimine", en: "Eyebrow tinting" },
    "Окрашивание ресниц": { et: "Ripsmete värvimine", en: "Eyelash tinting" },
    "Окрашивание бровей и ресниц + коррекция": {
      et: "Kulmude ja ripsmete värvimine + korrigeerimine",
      en: "Brow & lash tinting + shaping",
    },
    "Классический маникюр": { et: "Klassikaline maniküür", en: "Classic manicure" },
    "Маникюр + гель-лак": { et: "Maniküür geellakiga", en: "Manicure + gel polish" },
    "Покрытие лаком": { et: "Laki pealekandmine", en: "Nail polish application" },
    "Снятие гель-лака (с классическим маникюром)": {
      et: "Geellaki eemaldamine (klassikalise maniküüriga)",
      en: "Gel polish removal (with classic manicure)",
    },
    "Снятие гель-лака": { et: "Geellaki eemaldamine", en: "Gel polish removal" },
    "Наращивание ногтей (гель)": { et: "Küünte pikendamine (geel)", en: "Gel nail extensions" },
    "Коррекция гель-ногтей": { et: "Geelküünte korrektsioon", en: "Gel nail infill" },
    "Снятие наращенных ногтей": { et: "Pikendatud küünte eemaldamine", en: "Extension removal" },
    "Ремонт одного ногтя": { et: "Ühe küüne parandus", en: "Single nail repair" },
    "Классический педикюр": { et: "Klassikaline pediküür", en: "Classic pedicure" },
    "Педикюр + гель-лак": { et: "Pediküür geellakiga", en: "Pedicure + gel polish" },
    "Снятие гель-лака (с классическим педикюром)": {
      et: "Geellaki eemaldamine (klassikalise pediküüriga)",
      en: "Gel polish removal (with classic pedicure)",
    },
    "Мужской педикюр": { et: "Meeste pediküür", en: "Men's pedicure" },
    "Детская стрижка": { et: "Laste juukselõikus (kuni 12 a.)", en: "Children's haircut (up to 12)" },
    "Мужская стрижка": { et: "Meeste juukselõikus", en: "Men's haircut" },
    "Женская стрижка": { et: "Naiste juukselõikus", en: "Women's haircut" },
    "Мужская стрижка машинкой": { et: "Meeste juukselõikus masinaga", en: "Men's clipper cut" },
    "Стрижка бороды и усов": { et: "Habe ja vuntside lõikus", en: "Beard & moustache trim" },
    "Мытьё головы": { et: "Pesu", en: "Hair wash" },
    "Подравнивание кончиков": { et: "Otste ühtlustamine", en: "Trim ends" },
    "Стрижка чёлки": { et: "Patside lõikus", en: "Bangs trim" },
    "Мытьё + дневная укладка": { et: "Pesu + päevane soeng", en: "Wash + day styling" },
    "Дневная укладка": { et: "Päevane soeng", en: "Day styling" },
    "Выпрямление волос": { et: "Juuste sirgendamine", en: "Hair straightening" },
    "Укладка локонами": { et: "Lokkide soeng", en: "Curls styling" },
    "Праздничная укладка": { et: "Pidulik soeng", en: "Party styling" },
    "Свадебная укладка": { et: "Pulmasoeng", en: "Wedding styling" },
    "Окрашивание корней": { et: "Juurte värvimine", en: "Root touch-up" },
    "Полное окрашивание": { et: "Täisvärvimine", en: "Full color" },
    "Тонирование": { et: "Toonimine", en: "Toning" },
    "Окрашивание (короткие волосы)": { et: "Värvimine (lühikesed juuksed)", en: "Color (short hair)" },
    "Окрашивание (средние волосы)": { et: "Värvimine (keskmised juuksed)", en: "Color (medium hair)" },
    "Окрашивание (длинные волосы)": { et: "Värvimine (pikad juuksed)", en: "Color (long hair)" },
    "Окрашивание (очень длинные волосы)": {
      et: "Värvimine (väga pikad juuksed)",
      en: "Color (very long hair)",
    },
    "Окрашивание своим красителем": { et: "Värvimine oma värviga", en: "Color with client's dye" },
    "Мелирование (короткие волосы)": { et: "Mähkimine (lühikesed)", en: "Highlights (short)" },
    "Мелирование (средние волосы)": { et: "Mähkimine (keskmised)", en: "Highlights (medium)" },
    "Мелирование (длинные волосы)": { et: "Mähkimine (pikad)", en: "Highlights (long)" },
    "Мелирование (очень длинные волосы)": {
      et: "Mähkimine (väga pikad)",
      en: "Highlights (very long)",
    },
    "Хим. завивка (короткие)": { et: "Keemiline lokk (lühikesed)", en: "Perm (short)" },
    "Хим. завивка (длинные)": { et: "Keemiline lokk (pikad)", en: "Perm (long)" },
    "Химическая завивка (средние)": { et: "Keemiline lokk (keskmised)", en: "Perm (medium)" },
    /* New / renamed services from DB */
    "Детская стрижка (девочки)": { et: "Laste juukselõikus (tüdrukud)", en: "Children's haircut (girls)" },
    "Мужская стрижка + мытьё": { et: "Meeste juukselõikus + pesu", en: "Men's haircut + wash" },
    "Мужская стрижка машинкой + мытьё головы": { et: "Meeste juukselõikus masinaga + pesu", en: "Men's clipper cut + hair wash" },
    "Консультация + тест прядь": { et: "Konsultatsioon + testlokk", en: "Consultation + test strand" },
    "Снятие гелевых ногтей с маникюром": { et: "Geelküünte eemaldamine maniküüriga", en: "Gel nail removal with manicure" },
    "Снятие гель-лака с маникюром": { et: "Geellaki eemaldamine maniküüriga", en: "Gel polish removal with manicure" },
    "Тату хной": { et: "Hennamaaling", en: "Henna tattoo" },
    "Блонд ( Осветление пудрой + тонирования+ уход )": {
      et: "Blond (pulbriga valgendamine + toonimine + hooldus)",
      en: "Blonde (powder bleach + toning + care)",
    },
    "Выход из темного": { et: "Väljumine tumedast", en: "Dark-to-light transformation" },
    "Техники ( Мелирование, шатуш, омбре, airtouch, балаяж, комбинация техник )": {
      et: "Tehnikad (mähkimine, shatush, ombre, airtouch, balayage, kombinatsioon)",
      en: "Techniques (highlights, shatush, ombre, airtouch, balayage, combo)",
    },
    "Холодное восстановление": { et: "Külm taastamine", en: "Cold restoration treatment" },
    "Консультация + туст-прядь ( при явке  по записи сумма возвращается )": {
      et: "Konsultatsioon + testlokk (tasu tagastatakse visiidil)",
      en: "Consultation + test strand (fee refunded on visit)",
    },
    "Консультация + тест-прядь ( при явке  по записи сумма возвращается )": {
      et: "Konsultatsioon + testlokk (tasu tagastatakse visiidil)",
      en: "Consultation + test strand (fee refunded on visit)",
    },
    "Консультация + туст-прядь ( при явке по записи сумма возвращается )": {
      et: "Konsultatsioon + testlokk (tasu tagastatakse visiidil)",
      en: "Consultation + test strand (fee refunded on visit)",
    },
    "Консультация + тест-прядь ( при явке по записи сумма возвращается )": {
      et: "Konsultatsioon + testlokk (tasu tagastatakse visiidil)",
      en: "Consultation + test strand (fee refunded on visit)",
    },
  };

  function currentLang() {
    var lang = String(
      (window.ALESSANNA_PUBLIC_LOCALE || document.documentElement.getAttribute("lang") || "ru")
    )
      .toLowerCase()
      .slice(0, 2);
    return lang === "et" || lang === "en" ? lang : "ru";
  }

  window.ALESSANNA_CATALOG_NAME = function (type, ruName) {
    var ru = String(ruName || "").trim();
    if (!ru || currentLang() === "ru") return ru;
    var map = type === "category" ? CATEGORIES : SERVICES;
    var row = map[ru];
    if (!row) return ru;
    return row[currentLang()] || ru;
  };
})();
