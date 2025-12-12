// Popup script for PDF Citation Extractor

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const openSidebarBtn = document.getElementById('openSidebar');
  const openWebAppBtn = document.getElementById('openWebApp');
  
  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Check if it's a PDF
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
    
    if (response.isPdf) {
      statusEl.className = 'status pdf';
      statusEl.innerHTML = '✓ PDF detected<br><small>' + truncateUrl(response.url) + '</small>';
    } else {
      statusEl.className = 'status not-pdf';
      statusEl.innerHTML = 'Not a PDF page<br><small>Navigate to a PDF to extract citations</small>';
    }
  } catch (e) {
    statusEl.className = 'status not-pdf';
    statusEl.innerHTML = 'Cannot access this page<br><small>Try a different PDF</small>';
  }
  
  // Open sidebar panel
  openSidebarBtn.addEventListener('click', async () => {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    } catch (e) {
      console.error('Failed to open side panel:', e);
      // Fallback: activate content script
      chrome.tabs.sendMessage(tab.id, { action: 'activate' });
    }
  });
  
  // Open web app
  openWebAppBtn.addEventListener('click', () => {
    chrome.tabs.create({ 
      url: 'https://82d6f39a-fc96-4498-92e5-f36c5dc84ac0.lovableproject.com'
    });
    window.close();
  });
});

function truncateUrl(url) {
  if (url.length > 40) {
    return url.substring(0, 37) + '...';
  }
  return url;
}
