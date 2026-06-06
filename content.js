/**
 * content.js — LinkedIn Job Filter (content script)
 *
 * Supports two LinkedIn job search experiences:
 *   AI Search  — cards matched by [componentkey^="job-card-component-ref"]
 *   Classic    — cards matched by [data-job-id].job-card-container
 *
 * Only the cards belonging to the active experience are filtered; the other
 * experience's cards are always restored to visible.
 *
 * ── Adding a new AI Search filter ────────────────────────────────────────────
 * 1. Add a storage key to `settings` and to the chrome.storage.sync.get() call.
 * 2. Append one object to AI_FILTERS with a `name` and a `test` function.
 *
 * ── Adding a new Classic filter ─────────────────────────────────────────────
 * Same steps, but append to CLASSIC_FILTERS instead.
 */

(function () {

  // Guard against double-injection (e.g. background re-inject on SPA nav + manifest inject).
  if (window.__linkSieveActive) return;
  window.__linkSieveActive = true;

  // ── Settings ───────────────────────────────────────────────────────────────

  var settings = {
    extensionEnabled:     true,
    blocklist:            [],
    hideApplied:          false,
    experienceMode:       'ai',   // 'ai' | 'classic'
    classicHidePromoted:  false,
    classicHideApplied:   false,
    classicHideEasyApply: false,
  };

  // ── AI Search filter registry ──────────────────────────────────────────────

  var AI_FILTERS = [

    {
      name: 'blocklist',
      test: function (card, s) {
        var company = getCompany(card);
        return company !== null &&
               s.blocklist.some(function (b) { return company.includes(b); });
      },
    },

    {
      name: 'hideApplied',
      test: function (card, s) {
        return s.hideApplied && isApplied(card);
      },
    },

  ];

  // ── Classic Search filter registry ────────────────────────────────────────

  var CLASSIC_FILTERS = [

    {
      name: 'classic-blocklist',
      test: function (card, s) {
        var company = getClassicCompany(card);
        return company !== null &&
               s.blocklist.some(function (b) { return company.includes(b); });
      },
    },

    {
      name: 'classic-hideApplied',
      test: function (card, s) {
        return s.classicHideApplied && isClassicApplied(card);
      },
    },

    {
      name: 'classic-hidePromoted',
      test: function (card, s) {
        return s.classicHidePromoted && isClassicPromoted(card);
      },
    },

    {
      name: 'classic-hideEasyApply',
      test: function (card, s) {
        return s.classicHideEasyApply && isClassicEasyApply(card);
      },
    },

  ];

  // ── AI Search DOM helpers ──────────────────────────────────────────────────

  /**
   * Returns the wrapper element to show/hide for an AI Search card.
   * The card is nested 3 levels deep inside the outer list item.
   */
  function getHideTarget(card) {
    var el = card.parentElement &&
             card.parentElement.parentElement &&
             card.parentElement.parentElement.parentElement;
    return el || card;
  }

  /**
   * Extracts the company name from an AI Search job card.
   * The company <p> is the first span-free, non-empty <p> after the title <p>
   * (the title <p> is identified by having <span> children).
   */
  function getCompany(card) {
    var ps = card.querySelectorAll('p');
    var foundTitle = false;

    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (!foundTitle) {
        if (p.querySelector('span')) foundTitle = true;
      } else {
        if (!p.querySelector('span') && p.textContent.trim()) {
          return p.textContent.trim().toLowerCase();
        }
      }
    }

    return null;
  }

  function isApplied(card) {
    var ps = card.querySelectorAll('p');
    for (var i = 0; i < ps.length; i++) {
      if (ps[i].textContent.trim() === 'Applied') return true;
    }
    return false;
  }

  // ── Classic Search DOM helpers ─────────────────────────────────────────────

  /**
   * Returns the element to show/hide for a Classic card.
   * Walks up to the <li data-occludable-job-id> wrapper, then any <li>, then
   * falls back to the card div itself.
   */
  function getClassicHideTarget(card) {
    var li = card.closest('li[data-occludable-job-id]') || card.closest('li');
    return li || card;
  }

  function getClassicCompany(card) {
    var el = card.querySelector('.artdeco-entity-lockup__subtitle span[dir="ltr"]');
    return el ? el.textContent.trim().toLowerCase() : null;
  }

  function isClassicApplied(card) {
    var el = card.querySelector('.job-card-container__footer-job-state');
    return el ? el.textContent.trim() === 'Applied' : false;
  }

  function isClassicPromoted(card) {
    var spans = card.querySelectorAll(
      'ul.job-card-list__footer-wrapper li.job-card-container__footer-item span[dir="ltr"]'
    );
    for (var i = 0; i < spans.length; i++) {
      if (spans[i].textContent.trim() === 'Promoted') return true;
    }
    return false;
  }

  function isClassicEasyApply(card) {
    // SVG icon is a reliable signal; footer text is a fallback.
    if (card.querySelector('[data-test-icon="linkedin-bug-color-small"]')) return true;
    var items = card.querySelectorAll(
      'ul.job-card-list__footer-wrapper li.job-card-container__footer-item'
    );
    for (var i = 0; i < items.length; i++) {
      if (items[i].textContent.trim() === 'Easy Apply') return true;
    }
    return false;
  }

  // ── Core filter loop ───────────────────────────────────────────────────────

  function filterAll() {
    var aiCards      = document.querySelectorAll('[componentkey^="job-card-component-ref"]');
    var classicCards = document.querySelectorAll('[data-job-id].job-card-container');

    if (!settings.extensionEnabled) {
      aiCards.forEach(function (card) { getHideTarget(card).style.display = ''; });
      classicCards.forEach(function (card) { getClassicHideTarget(card).style.display = ''; });
      return;
    }

    if (settings.experienceMode === 'classic') {
      // Restore AI cards; filter Classic cards.
      aiCards.forEach(function (card) { getHideTarget(card).style.display = ''; });
      classicCards.forEach(function (card) {
        var target = getClassicHideTarget(card);
        var shouldHide = CLASSIC_FILTERS.some(function (f) { return f.test(card, settings); });
        target.style.display = shouldHide ? 'none' : '';
      });
    } else {
      // Restore Classic cards; filter AI cards.
      classicCards.forEach(function (card) { getClassicHideTarget(card).style.display = ''; });
      aiCards.forEach(function (card) {
        var target = getHideTarget(card);
        var shouldHide = AI_FILTERS.some(function (f) { return f.test(card, settings); });
        target.style.display = shouldHide ? 'none' : '';
      });
    }
  }

  // ── Storage sync ───────────────────────────────────────────────────────────

  function applyStorageData(data) {
    if (data.blocklist !== undefined) {
      settings.blocklist = data.blocklist.map(function (c) { return c.toLowerCase(); });
    }
    if (data.hideApplied !== undefined)          settings.hideApplied          = !!data.hideApplied;
    if (data.extensionEnabled !== undefined)     settings.extensionEnabled     = !!data.extensionEnabled;
    if (data.experienceMode !== undefined)       settings.experienceMode       = data.experienceMode;
    if (data.classicHidePromoted !== undefined)  settings.classicHidePromoted  = !!data.classicHidePromoted;
    if (data.classicHideApplied !== undefined)   settings.classicHideApplied   = !!data.classicHideApplied;
    if (data.classicHideEasyApply !== undefined) settings.classicHideEasyApply = !!data.classicHideEasyApply;
  }

  function init() {
    chrome.storage.sync.get(
      ['blocklist', 'hideApplied', 'extensionEnabled', 'experienceMode',
       'classicHidePromoted', 'classicHideApplied', 'classicHideEasyApply'],
      function (data) {
        applyStorageData(data);
        filterAll();
        observe();
      }
    );
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'sync') return;
    var patch = {};
    Object.keys(changes).forEach(function (key) {
      patch[key] = changes[key].newValue;
    });
    applyStorageData(patch);
    filterAll();
  });

  // ── Mutation observer ──────────────────────────────────────────────────────

  function observe() {
    new MutationObserver(function () {
      filterAll();
    }).observe(document.body, { childList: true, subtree: true });
  }

  init();

})();
