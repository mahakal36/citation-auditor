// Content script for PDF Citation Extractor
// Detects PDF pages and enables text selection for classification

let isExtensionActive = false;
let selectedTextHandler = null;

// Check if current page is a PDF
function isPdfPage() {
  // Chrome's built-in PDF viewer
  if (document.contentType === 'application/pdf') return true;
  // PDF embedded in page
  if (document.querySelector('embed[type="application/pdf"]')) return true;
  // URL ends with .pdf
  if (window.location.href.toLowerCase().endsWith('.pdf')) return true;
  return false;
}

// Get selected text with context
function getSelectedTextWithContext() {
  const selection = window.getSelection();
  if (!selection || selection.toString().trim() === '') return null;
  
  const selectedText = selection.toString().trim();
  
  // Try to get surrounding context
  let surroundingContext = '';
  try {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    if (container.textContent) {
      surroundingContext = container.textContent.substring(
        Math.max(0, container.textContent.indexOf(selectedText) - 200),
        Math.min(container.textContent.length, container.textContent.indexOf(selectedText) + selectedText.length + 200)
      );
    }
  } catch (e) {
    console.log('Could not get surrounding context:', e);
  }
  
  return { selectedText, surroundingContext };
}

// Handle text selection for classification
function handleTextSelection(event) {
  if (!isExtensionActive) return;
  
  const textData = getSelectedTextWithContext();
  if (!textData) return;
  
  // Send to sidebar for classification
  chrome.runtime.sendMessage({
    action: 'textSelected',
    data: textData
  });
}

// Extract visible text from the page
function extractPageText() {
  // For Chrome's PDF viewer, we need special handling
  if (document.contentType === 'application/pdf') {
    // Chrome's PDF viewer doesn't expose text directly
    // We'll need to use the PDF URL and process it in the sidebar
    return {
      type: 'pdf-viewer',
      url: window.location.href,
      text: ''
    };
  }
  
  // For regular pages with PDFs or text content
  const textContent = document.body?.innerText || '';
  return {
    type: 'html',
    url: window.location.href,
    text: textContent
  };
}

// Listen for messages from popup/sidebar
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'activate') {
    isExtensionActive = true;
    document.addEventListener('mouseup', handleTextSelection);
    sendResponse({ success: true, isPdf: isPdfPage() });
  }
  
  if (request.action === 'deactivate') {
    isExtensionActive = false;
    document.removeEventListener('mouseup', handleTextSelection);
    sendResponse({ success: true });
  }
  
  if (request.action === 'getPageInfo') {
    sendResponse({
      isPdf: isPdfPage(),
      url: window.location.href,
      title: document.title
    });
  }
  
  if (request.action === 'extractText') {
    const pageData = extractPageText();
    sendResponse(pageData);
  }
});

// Notify that content script is ready
chrome.runtime.sendMessage({ action: 'contentScriptReady', isPdf: isPdfPage() });

console.log('PDF Citation Extractor content script loaded', { isPdf: isPdfPage() });
