/**
 * background.js — LinkSieve service worker
 *
 * Responsibilities:
 *   1. Keep the toolbar icon in sync with the `extensionEnabled` setting.
 *   2. Re-inject content.js when the user navigates to a LinkedIn jobs page
 *      via client-side (pushState) navigation, which Chrome's manifest-declared
 *      content_scripts do not catch.
 */

/** Swaps the action icon based on the enabled state. */
function updateIcon(enabled) {
  var suffix = enabled ? '' : '_paused';
  chrome.action.setIcon({
    path: {
      16:  'icons/icon16'  + suffix + '.png',
      48:  'icons/icon48'  + suffix + '.png',
      128: 'icons/icon128' + suffix + '.png',
    },
  });
}

// ── Startup ────────────────────────────────────────────────────────────────

chrome.storage.sync.get('extensionEnabled', function (data) {
  updateIcon(data.extensionEnabled !== false);
});

// ── Live icon updates ──────────────────────────────────────────────────────

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'sync' && 'extensionEnabled' in changes) {
    updateIcon(!!changes.extensionEnabled.newValue);
  }
});

// ── SPA navigation re-injection ────────────────────────────────────────────
// LinkedIn is a single-page app. When the user navigates to the jobs page
// from another part of LinkedIn (pushState), Chrome does not re-run the
// manifest-declared content script. We detect the URL change here and inject
// manually. The guard in content.js (window.__linkSieveActive) prevents
// duplicate setup on normal full-page loads.

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.url && /^https:\/\/www\.linkedin\.com\/jobs\//.test(changeInfo.url)) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js'],
    });
  }
});
