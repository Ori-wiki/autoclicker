function withActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0] ? tabs[0] : null;
    if (!tab || typeof tab.id !== 'number') {
      return;
    }

    callback(tab.id);
  });
}

function sendAction(action) {
  withActiveTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { action }, () => {
      chrome.runtime.lastError;
    });
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'start_clicker') {
    sendAction('start');
    return;
  }

  if (command === 'pause_clicker') {
    sendAction('togglePause');
    return;
  }

  if (command === 'stop_clicker') {
    sendAction('stop');
  }
});
