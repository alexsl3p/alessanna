/**
 * Public landing: /locales/{lang}.json + [data-i18n]. Languages: ru, et, en.
 * Routes: /ru/, /et/, /en/ (GitHub Pages) or server renderPublicLandingHtml.
 * First visit at / → language picker until guest chooses.
 */
(function () {
  "use strict";

  var PUBLIC_LANGS = ["ru", "et", "en"];
  var STORAGE_KEY = "alessanna_lang";

  function byPath(obj, path) {
    return path.split(".").reduce(function (acc, key) {
      return acc && acc[key] !== undefined && acc[key] !== null ? acc[key] : null;
    }, obj);
  }

  function pathLang() {
    var seg = (location.pathname.split("/").filter(Boolean)[0] || "").toLowerCase();
    if (PUBLIC_LANGS.indexOf(seg) >= 0) return seg;
    try {
      var q = new URLSearchParams(location.search).get("lang");
      if (q && PUBLIC_LANGS.indexOf(q.toLowerCase().slice(0, 2)) >= 0) {
        return q.toLowerCase().slice(0, 2);
      }
    } catch (e) {}
    return null;
  }

  function storedLang() {
    try {
      var v = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("lang");
      if (v && PUBLIC_LANGS.indexOf(v) >= 0) return v;
    } catch (e) {}
    return null;
  }

  function normalizeLang(lang) {
    lang = String(lang || "ru").toLowerCase().slice(0, 2);
    return PUBLIC_LANGS.indexOf(lang) >= 0 ? lang : "ru";
  }

  function t(key, fallback) {
    var v = byPath(window.ALESSANNA_PUBLIC_I18N, key);
    return typeof v === "string" ? v : fallback != null ? fallback : key;
  }

  function tArr(key) {
    var v = byPath(window.ALESSANNA_PUBLIC_I18N, key);
    return Array.isArray(v) ? v : null;
  }

  function publishRuntimeI18n() {
    window.ALESSANNA_T = t;
    window.ALESSANNA_T_ARR = tArr;
    window.ALESSANNA_BUILD_CALENDAR_MSGS = function () {
      return {
        noTime: t("site.calendarNotePrimary", "No available times"),
        noTimeShort: t("site.ui.calNoTimeShort", "None"),
        pickMaster: t("site.calendarNoteSecondary", "Choose a stylist"),
        pickDay: t("site.ui.calPickDay", "Pick a day"),
        pickTimeFirst: t("site.formTimeFirst", "Choose a day first"),
        pickTime: t("site.ui.calPickTime", "Pick a time"),
        many: t("site.ui.calMany", "Many slots"),
        busy: t("site.ui.calBusy", "Almost full"),
        best: t("site.ui.calBest", "Best day"),
        slotsAvailable: t("site.ui.calSlotsAvailable", "Available:"),
        dayPast: t("site.ui.calDayPast", "Past date"),
        dayOff: t("site.ui.calDayOff", "Day off"),
        dayNoSlots: t("site.ui.calDayNoSlots", "No openings"),
        legendBest: t("site.legendFeatured", "Best dates"),
        legendMany: t("site.legendSoft", "Many slots"),
        legendBusy: t("site.legendBusy", "Almost full"),
        legendUnavailable: t("site.legendUnavailable", "No slots / closed"),
      };
    };
    window.ALESSANNA_BUILD_REVIEW_MSGS = function () {
      return {
        subject: t("site.ui.reviewSubject", "Review"),
        name: t("site.ui.reviewName", "Name"),
        email: t("site.ui.reviewEmail", "Email"),
        rating: t("site.ui.reviewRating", "Rating"),
        message: t("site.ui.reviewMessage", "Message"),
        alertName: t("site.ui.reviewAlertName", "Enter name"),
        alertMsg: t("site.ui.reviewAlertMsg", "Write feedback"),
        alertEmail: t("site.ui.reviewAlertEmail", "Check email"),
      };
    };
    window.ALESSANNA_BUILD_CHAIN_ERRORS = function () {
      return {
        staff_busy: t("site.ui.errStaffBusy", "Busy"),
        no_free_master: t("site.ui.errNoFreeMaster", "No free stylist"),
        salon_closed: t("site.ui.errSalonClosed", "Salon is closed on this day"),
        staff_not_service: t("site.ui.errStaffNotService", "Stylist mismatch"),
        staff_unavailable: t("site.ui.errStaffUnavailable", "Unavailable"),
        service_inactive: t("site.ui.errServiceInactive", "Inactive"),
        service_not_found: t("site.ui.errServiceNotFound", "Not found"),
        service_no_duration: t("site.ui.errServiceNoDuration", "No duration"),
        missing_name: t("site.ui.errMissingName", "Enter name"),
        missing_start: t("site.ui.errMissingStart", "Pick time"),
        empty_items: t("site.ui.errEmptyItems", "Pick a service"),
        too_many_items: t("site.ui.errTooManyItems", "One service only"),
      };
    };
  }

  function applyBundle(bundle) {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (!key) return;
      var v = byPath(bundle, key);
      if (typeof v !== "string") return;
      if (el.hasAttribute("data-i18n-html")) el.innerHTML = v;
      else el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (!key || !("placeholder" in el)) return;
      var v = byPath(bundle, key);
      if (typeof v === "string") el.setAttribute("placeholder", v);
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      var spec = el.getAttribute("data-i18n-attr");
      if (!spec || spec.indexOf(":") < 0) return;
      var c = spec.indexOf(":");
      var attr = spec.slice(0, c);
      var key = spec.slice(c + 1);
      var v = byPath(bundle, key);
      if (typeof v === "string") el.setAttribute(attr, v);
    });
  }

  function setDocumentLang(lang) {
    document.documentElement.setAttribute("lang", lang);
  }

  function updateLangSwitcher(lang) {
    document.querySelectorAll(".lang-switch a[data-lang]").forEach(function (a) {
      var on = a.getAttribute("data-lang") === lang;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function showLangPicker() {
    var el = document.getElementById("lang-picker");
    if (!el) return;
    el.hidden = false;
    document.body.classList.add("lang-picker-open");
  }

  function hideLangPicker() {
    var el = document.getElementById("lang-picker");
    if (!el) return;
    el.hidden = true;
    document.body.classList.remove("lang-picker-open");
  }

  function localeUrl(lang) {
    return "/locales/" + lang + ".json";
  }

  function loadBundle(lang, done) {
    lang = normalizeLang(lang);
    setDocumentLang(lang);
    updateLangSwitcher(lang);
    return fetch(localeUrl(lang))
      .then(function (r) {
        if (!r.ok) throw new Error("locales");
        return r.json();
      })
      .then(function (bundle) {
        window.ALESSANNA_PUBLIC_LOCALE = lang;
        window.ALESSANNA_PUBLIC_I18N = bundle;
        publishRuntimeI18n();
        applyBundle(bundle);
        hideLangPicker();
        try {
          document.dispatchEvent(
            new CustomEvent("alessanna:locale", { detail: { lang: lang, bundle: bundle } })
          );
        } catch (e) {}
        if (typeof done === "function") done(null, bundle);
        return bundle;
      })
      .catch(function (err) {
        if (typeof done === "function") done(err);
      });
  }

  function pickLang(lang) {
    lang = normalizeLang(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      localStorage.setItem("lang", lang);
    } catch (e) {}
    if (pathLang() === lang) {
      loadBundle(lang);
      return;
    }
    var target = "/" + lang + "/";
    var qs = location.search || "";
    var hash = location.hash || "";
    location.assign(target + qs + hash);
  }

  function wireLangPicker() {
    var root = document.getElementById("lang-picker");
    if (!root) return;
    root.querySelectorAll("[data-pick-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pickLang(btn.getAttribute("data-pick-lang"));
      });
    });
  }

  function wireLangSwitcher() {
    document.querySelectorAll(".lang-switch a[data-lang]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        var lang = a.getAttribute("data-lang");
        if (!lang || pathLang() === lang) return;
        ev.preventDefault();
        pickLang(lang);
      });
    });
  }

  function boot() {
    wireLangPicker();
    wireLangSwitcher();
    var fromPath = pathLang();
    var saved = storedLang();

    if (!saved) {
      if (fromPath) {
        try {
          localStorage.setItem(STORAGE_KEY, fromPath);
          localStorage.setItem("lang", fromPath);
        } catch (e) {}
        loadBundle(fromPath);
        return;
      }
      showLangPicker();
      return;
    }

    if (fromPath) {
      loadBundle(fromPath);
      return;
    }

    location.replace("/" + saved + "/" + (location.search || "") + (location.hash || ""));
  }

  window.ALESSANNA_APPLY_PUBLIC_I18N = applyBundle;
  window.ALESSANNA_SET_LANG = pickLang;
  window.ALESSANNA_PUBLIC_LANGS = PUBLIC_LANGS;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
