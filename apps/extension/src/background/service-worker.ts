import { parseGitHubUrl } from '@opensourced/common';

// Open side panel on extension action click
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('Error setting side panel behavior:', err));

// Observe tab URL updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    const context = parseGitHubUrl(changeInfo.url);
    if (context) {
      chrome.runtime.sendMessage({
        type: 'GITHUB_CONTEXT_UPDATED',
        payload: context,
      }).catch(() => {
        // Side panel may not be open yet
      });
    }
  }
});

// Observe active tab switches
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      const context = parseGitHubUrl(tab.url);
      if (context) {
        chrome.runtime.sendMessage({
          type: 'GITHUB_CONTEXT_UPDATED',
          payload: context,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Error in onActivated listener:', err);
  }
});
