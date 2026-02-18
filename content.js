let intervalId = null;

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'start') {
    if (!intervalId) {
      intervalId = setInterval(() => {
        document.body.click();
      }, 1000); // 1 клик в секунду
    }
  }

  if (request.action === 'stop') {
    clearInterval(intervalId);
    intervalId = null;
  }
});
