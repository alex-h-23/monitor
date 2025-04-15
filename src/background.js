chrome.alarms.create('checkRefresh', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkRefresh') {
    handleRefreshCheck();
  }
});

chrome.windows.onCreated.addListener((window) => {
  if (window.type === 'normal') {
    openDefaultTabsInWindow(window.id);
  }
});

initRotation().catch(() => {/* ignore errors */});

let rotateTimer = null;

async function initRotation() {
  const rotationData = await getLocalStorage('rotationData', { enabled: false, intervalSec: 30, windowId: null });
  if (rotationData.enabled && rotationData.windowId) {
    startRotation(rotationData);
  }
}

function startRotation(rotationData) {
  clearRotation(); 

  if (!rotationData.enabled || !rotationData.windowId || rotationData.intervalSec < 1) return;

  rotateTimer = setInterval(() => {
    rotateTabsInWindow(rotationData.windowId);
  }, rotationData.intervalSec * 1000);
}

function clearRotation() {
  if (rotateTimer) {
    clearInterval(rotateTimer);
    rotateTimer = null;
  }
}

function rotateTabsInWindow(windowId) {
  chrome.tabs.query({ windowId }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const activeIndex = tabs.findIndex((t) => t.active);
    if (activeIndex < 0) return;

    let nextIndex = activeIndex + 1;
    if (nextIndex >= tabs.length) {
      nextIndex = 0;
    }

    const nextTabId = tabs[nextIndex].id;
    chrome.tabs.update(nextTabId, { active: true });
  });
}

async function handleRefreshCheck() {
  const data = await getLocalStorage('refreshData', {});
  const now = Date.now();

  for (const [tabId, info] of Object.entries(data)) {
    const { interval, lastRefresh } = info;
    if (!interval || interval <= 0) continue;

    const nextRefresh = lastRefresh + interval * 60 * 1000;
    if (now >= nextRefresh) {
      chrome.tabs.reload(parseInt(tabId), () => {
        data[tabId].lastRefresh = Date.now();
        setLocalStorage('refreshData', data);
      });
    }
  }
}

// Message utility

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateTabInterval') {
    updateTabInterval(request.tabId, request.interval).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (request.action === 'removeTabRefresh') {
    removeTabRefresh(request.tabId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (request.action === 'addDefaultTab') {
    addDefaultTab(request.url, request.interval).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (request.action === 'removeDefaultTab') {
    removeDefaultTab(request.index).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (request.action === 'listDefaultTabs') {
    listDefaultTabs().then((defaultTabs) => {
      sendResponse({ success: true, defaultTabs });
    });
    return true;
  }

  else if (request.action === 'enableRotation') {
    enableRotation(request.windowId, request.intervalSec).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (request.action === 'disableRotation') {
    disableRotation().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Refresh utility

async function updateTabInterval(tabId, interval) {
  const data = await getLocalStorage('refreshData', {});
  data[tabId] = {
    interval,
    lastRefresh: data[tabId]?.lastRefresh || Date.now()
  };
  await setLocalStorage('refreshData', data);
}

async function removeTabRefresh(tabId) {
  const data = await getLocalStorage('refreshData', {});
  if (data[tabId]) {
    delete data[tabId];
  }
  await setLocalStorage('refreshData', data);
}

// Default tabs utility

async function addDefaultTab(url, interval) {
  const defaultTabs = await getLocalStorage('defaultTabs', []);
  defaultTabs.push({ url, interval });
  await setLocalStorage('defaultTabs', defaultTabs);
}

async function removeDefaultTab(index) {
  const defaultTabs = await getLocalStorage('defaultTabs', []);
  if (index >= 0 && index < defaultTabs.length) {
    defaultTabs.splice(index, 1);
    await setLocalStorage('defaultTabs', defaultTabs);
  }
}

async function listDefaultTabs() {
  return await getLocalStorage('defaultTabs', []);
}

// Rotation utility

async function enableRotation(windowId, intervalSec) {
  const rotationData = { enabled: true, intervalSec, windowId };
  await setLocalStorage('rotationData', rotationData);
  startRotation(rotationData);
}

async function disableRotation() {
  const rotationData = { enabled: false, intervalSec: 0, windowId: null };
  await setLocalStorage('rotationData', rotationData);
  clearRotation();
}


// Local storage get/set

function getLocalStorage(key, defaultVal) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (res) => {
      if (res && res[key] !== undefined) {
        resolve(res[key]);
      } else {
        resolve(defaultVal);
      }
    });
  });
}

function setLocalStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}
