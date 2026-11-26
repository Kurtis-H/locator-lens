// Service worker: inject the lens into the current tab on demand.
//
// Uses activeTab, so the extension can only touch a page after you click its
// button or press its shortcut on that page. It has no access to any site
// otherwise, and never runs in the background.

const FILES = ["src/locators.js", "src/content.js"];

export async function toggleLens(tab) {
  if (!tab || tab.id === undefined) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES });
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    return true;
  } catch (err) {
    // Chrome's own pages and the Web Store can't be scripted.
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    await chrome.action.setTitle({ tabId: tab.id, title: `Locator Lens can't run here: ${err.message}` });
    return false;
  }
}

chrome.action.onClicked.addListener((tab) => toggleLens(tab));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-lens") toggleLens(tab);
});

// For the end-to-end tests, which can't click the toolbar button.
globalThis.toggleLens = toggleLens;
