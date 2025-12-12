// Background service worker for PDF Citation Extractor

const SUPABASE_URL = 'https://ifaocwtvjzlbgimxaqig.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmYW9jd3R2anpsYmdpbXhhcWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MzA5MjksImV4cCI6MjA3OTUwNjkyOX0.TLGDyY2F9sIc3qAZRU3jM-jLNxgBAXDfctp__pmuxLs';

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for messages from content script or sidebar
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractCitations') {
    extractCitations(request.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'classifyText') {
    classifyText(request.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'openSidePanel') {
    chrome.sidePanel.open({ tabId: sender.tab.id });
    sendResponse({ success: true });
  }
});

// Extract citations using Supabase edge function
async function extractCitations({ pageText, pageNumber, fewShotExamples, memoryContext }) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-citations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      pageText,
      pageNumber,
      fewShotExamples: fewShotExamples || [],
      memoryContext: memoryContext || {}
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Extraction failed: ${errorText}`);
  }
  
  return response.json();
}

// Classify selected text using Supabase edge function
async function classifyText({ selectedText, surroundingContext }) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/classify-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      selectedText,
      surroundingContext: surroundingContext || ''
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Classification failed: ${errorText}`);
  }
  
  return response.json();
}

console.log('PDF Citation Extractor background script loaded');
