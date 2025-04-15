document.addEventListener('DOMContentLoaded', async () => {
    const loadingMessage = document.getElementById('loadingMessage');
    const tabsList = document.getElementById('tabsList');
    const rotationSection = document.getElementById('rotationSection');
    const rotationSlider = document.getElementById('rotationSlider');
    const rotationValueSpan = document.getElementById('rotationValue');
    const rotationToggle = document.getElementById('rotationToggle');
    const defaultTabUrlInput = document.getElementById('defaultTabUrl');
    const defaultTabSlider = document.getElementById('defaultTabIntervalSlider');
    const defaultTabSliderValue = document.getElementById('defaultTabIntervalValue');
    const addDefaultTabButton = document.getElementById('addDefaultTabButton');
    const defaultTabsSection = document.getElementById('defaultTabsSection');
  
    // Hook up slider text updates
    rotationSlider.addEventListener('input', () => {
      rotationValueSpan.textContent = rotationSlider.value;
    });
    // Default tab slider
    defaultTabSlider.addEventListener('input', () => {
      defaultTabSliderValue.textContent = defaultTabSlider.value;
    });
  
    // Build list of open tabs
    const openTabs = await new Promise((resolve) => {
      chrome.tabs.query({ currentWindow: true }, resolve);
    });
    const refreshData = await getLocalStorage('refreshData', {});
  
    tabsList.textContent = '';
    openTabs.forEach((tab) => {
      const tabId = String(tab.id);
      const info = refreshData[tabId] || {};
      const interval = info.interval || 0;
  
      const container = document.createElement('div');
      container.className = 'tab-entry';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'tab-title';
      titleSpan.textContent = tab.title || 'Untitled';
      const sliderGroup = document.createElement('div');
      sliderGroup.className = 'slider-group';
  
      const sliderInput = document.createElement('input');
      sliderInput.type = 'range';
      sliderInput.className = 'range-slider';
      sliderInput.min = '1';
      sliderInput.max = '30';
      sliderInput.value = interval > 0 ? interval : 1;
  
      const sliderValueSpan = document.createElement('span');
      sliderValueSpan.className = 'slider-value';
      sliderValueSpan.textContent = sliderInput.value;
  
      sliderInput.addEventListener('input', () => {
        sliderValueSpan.textContent = sliderInput.value;
      });
  
      sliderGroup.appendChild(sliderInput);
      sliderGroup.appendChild(sliderValueSpan);
      sliderGroup.appendChild(document.createTextNode('m'));
  
      const applyButton = document.createElement('button');
      applyButton.textContent = 'Apply';
      applyButton.className = 'tab-button';
      applyButton.addEventListener('click', () => {
        const newInterval = parseInt(sliderInput.value, 10);
        chrome.runtime.sendMessage({
          action: 'updateTabInterval',
          tabId: tabId,
          interval: newInterval
        }, (response) => {
          if (response.success) {
            refreshData[tabId] = {
              interval: newInterval,
              lastRefresh: refreshData[tabId]?.lastRefresh || Date.now()
            };
          }
        });
      });
  
      const removeButton = document.createElement('button');
      removeButton.textContent = 'Remove';
      removeButton.className = 'tab-button remove-button';
      removeButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          action: 'removeTabRefresh',
          tabId: tabId
        }, (response) => {
          if (response.success) {
            delete refreshData[tabId];
            sliderInput.value = '1';
            sliderValueSpan.textContent = '1';
          }
        });
      });
  
      // Countdown
      const countdownSpan = document.createElement('span');
      countdownSpan.className = 'countdown';
      countdownSpan.textContent = '...';
  
      container.appendChild(titleSpan);
      container.appendChild(sliderGroup);
      container.appendChild(applyButton);
      container.appendChild(removeButton);
      container.appendChild(countdownSpan);
      tabsList.appendChild(container);
  
      // Update countdown every second (while popup is open)
      setInterval(() => {
        const now = Date.now();
        const activeInterval = refreshData[tabId]?.interval || 0;
        const activeLastRefresh = refreshData[tabId]?.lastRefresh || now;
  
        if (activeInterval <= 0) {
          countdownSpan.textContent = 'No refresh';
          return;
        }
  
        const nextRefresh = activeLastRefresh + activeInterval * 60 * 1000;
        const diffSeconds = Math.floor((nextRefresh - now) / 1000);
  
        if (diffSeconds <= 0) {
          countdownSpan.textContent = 'Refreshing...';
          chrome.tabs.reload(parseInt(tabId), () => {
            refreshData[tabId].lastRefresh = Date.now();
            setLocalStorage('refreshData', refreshData);
          });
        } else {
          const minutes = Math.floor(diffSeconds / 60);
          const seconds = diffSeconds % 60;
          countdownSpan.textContent = `Next in ${minutes}m ${seconds}s`;
        }
      }, 1000);
    });
  
    // Show rotation section
    rotationSection.style.display = 'block';
  
    // Check if rotation is already enabled/stored
    const currentWindow = await new Promise((resolve) => {
      chrome.windows.getCurrent({}, resolve);
    });
    const rotationData = await getLocalStorage('rotationData', { enabled: false, intervalSec: 30, windowId: null });
  
    if (rotationData.enabled && rotationData.windowId === currentWindow.id) {
      rotationSlider.value = rotationData.intervalSec;
      rotationValueSpan.textContent = rotationData.intervalSec;
      rotationToggle.textContent = 'Disable';
    } else {
      rotationSlider.value = 30;
      rotationValueSpan.textContent = '30';
      rotationToggle.textContent = 'Enable';
    }
  
    rotationToggle.addEventListener('click', () => {
      const intervalSec = parseInt(rotationSlider.value, 10);
      if (rotationToggle.textContent === 'Enable') {
        chrome.runtime.sendMessage({
          action: 'enableRotation',
          windowId: currentWindow.id,
          intervalSec
        }, (resp) => {
          if (resp.success) {
            rotationToggle.textContent = 'Disable';
          }
        });
      } else {
        chrome.runtime.sendMessage({ action: 'disableRotation' }, (resp) => {
          if (resp.success) {
            rotationToggle.textContent = 'Enable';
          }
        });
      }
    });
  
    // Default tabs
    defaultTabSlider.addEventListener('input', () => {
      defaultTabSliderValue.textContent = defaultTabSlider.value;
    });

    chrome.runtime.sendMessage({ action: 'listDefaultTabs' }, (response) => {
      if (response.success) {
        renderDefaultTabs(response.defaultTabs);
      }
    });

    addDefaultTabButton.addEventListener('click', () => {
      const url = defaultTabUrlInput.value.trim();
      if (!url) return;
  
      const interval = parseInt(defaultTabSlider.value, 10);
      chrome.runtime.sendMessage({ action: 'addDefaultTab', url, interval }, (resp) => {
        if (resp.success) {
          defaultTabUrlInput.value = '';
          chrome.runtime.sendMessage({ action: 'listDefaultTabs' }, (res2) => {
            if (res2.success) {
              renderDefaultTabs(res2.defaultTabs);
            }
          });
        }
      });
    });

    loadingMessage.style.display = 'none';
    tabsList.style.display = 'block';
  });
  
  function renderDefaultTabs(defaultTabs) {
    const defaultTabsSection = document.getElementById('defaultTabsSection');
    defaultTabsSection.innerHTML = '';
  
    if (!defaultTabs || defaultTabs.length === 0) {
      defaultTabsSection.style.display = 'none';
      return;
    }
    defaultTabsSection.style.display = 'block';
  
    defaultTabs.forEach((dt, index) => {
      const container = document.createElement('div');
      container.className = 'default-tabs-entry';

      const urlSpan = document.createElement('span');
      urlSpan.className = 'dt-url';
      urlSpan.textContent = dt.url;

      const intervalSpan = document.createElement('span');
      intervalSpan.textContent = `${dt.interval}m`;

      const openNowBtn = document.createElement('button');
      openNowBtn.className = 'tab-button';
      openNowBtn.textContent = 'Open Now';
      openNowBtn.addEventListener('click', () => {
        chrome.windows.getCurrent({ populate: false }, (win) => {
          chrome.tabs.create({ windowId: win.id, url: dt.url }, (newTab) => {
            chrome.runtime.sendMessage({
              action: 'updateTabInterval',
              tabId: newTab.id,
              interval: dt.interval
            });
          });
        });
      });
      const removeBtn = document.createElement('button');
      removeBtn.className = 'tab-button remove-button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'removeDefaultTab', index }, (resp) => {
          if (resp.success) {
            chrome.runtime.sendMessage({ action: 'listDefaultTabs' }, (res2) => {
              if (res2.success) {
                renderDefaultTabs(res2.defaultTabs);
              }
            });
          }
        });
      });
  
      container.appendChild(urlSpan);
      container.appendChild(intervalSpan);
      container.appendChild(openNowBtn);
      container.appendChild(removeBtn);
  
      defaultTabsSection.appendChild(container);
    });
  }
  
  // Simple local storage helpers
  function getLocalStorage(key, defaultVal) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (res) => {
        if (res && res[key] !== undefined) resolve(res[key]);
        else resolve(defaultVal);
      });
    });
  }
  function setLocalStorage(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }
  