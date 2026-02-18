let intervalId = null;
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

document.addEventListener(
  'mousemove',
  (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  },
  { passive: true },
);

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'start') {
    if (intervalId) {
      return;
    }

    intervalId = setInterval(() => {
      const target = document.elementFromPoint(mouseX, mouseY);
      if (target && typeof target.click === 'function') {
        target.click();
      }
    }, 1000);
  }

  if (request.action === 'stop') {
    clearInterval(intervalId);
    intervalId = null;
  }
});
