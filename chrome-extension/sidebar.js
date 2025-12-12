// Sidebar script for PDF Citation Extractor

const COLUMNS = [
  'Non-Bates Exhibits',
  'Depositions', 
  'date',
  'cites',
  'BatesBegin',
  'BatesEnd',
  'Pinpoint',
  'Code Lines',
  'Report Name',
  'Paragraph No.'
];

let citations = [];
let fewShotExamples = [];
let memoryContext = {};

// DOM Elements
const extractBtn = document.getElementById('extractBtn');
const exportBtn = document.getElementById('exportBtn');
const addRowBtn = document.getElementById('addRowBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const tableBody = document.getElementById('tableBody');
const emptyState = document.getElementById('emptyState');
const statusText = document.getElementById('statusText');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const rowCount = document.getElementById('rowCount');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  setupEventListeners();
  activateContentScript();
});

function setupEventListeners() {
  extractBtn.addEventListener('click', handleExtract);
  exportBtn.addEventListener('click', handleExport);
  addRowBtn.addEventListener('click', addEmptyRow);
  clearAllBtn.addEventListener('click', handleClearAll);
}

// Activate content script on current tab
async function activateContentScript() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { action: 'activate' });
  } catch (e) {
    console.log('Could not activate content script:', e);
  }
}

// Listen for text selection from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'textSelected') {
    handleTextSelection(request.data);
  }
});

// Handle text selection for classification
async function handleTextSelection({ selectedText, surroundingContext }) {
  if (!selectedText || selectedText.length < 3) return;
  
  setStatus(`Classifying: "${selectedText.substring(0, 50)}..."`);
  showLoading('Classifying selected text...');
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'classifyText',
      data: { selectedText, surroundingContext }
    });
    
    if (response.success && response.data) {
      const classification = response.data;
      addClassifiedRow(classification);
      setStatus('Text classified and added to table');
    } else {
      throw new Error(response.error || 'Classification failed');
    }
  } catch (error) {
    console.error('Classification error:', error);
    setStatus('Classification failed: ' + error.message);
  } finally {
    hideLoading();
  }
}

// Add a row from classified text
function addClassifiedRow(classification) {
  const newRow = {};
  COLUMNS.forEach(col => {
    newRow[col] = classification[col] || '';
  });
  citations.push(newRow);
  renderTable();
  saveToStorage();
}

// Handle extract button click
async function handleExtract() {
  setStatus('Getting page content...');
  showLoading('Extracting citations...');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Get page text from content script
    const pageData = await chrome.tabs.sendMessage(tab.id, { action: 'extractText' });
    
    if (pageData.type === 'pdf-viewer') {
      // For Chrome's PDF viewer, we need to fetch the PDF and extract text
      setStatus('PDF detected - fetching content...');
      // Note: Direct PDF text extraction from Chrome's viewer is limited
      // User should use the full web app for best results
      hideLoading();
      setStatus('For best results with PDFs, use the full web app');
      return;
    }
    
    if (!pageData.text || pageData.text.length < 50) {
      throw new Error('Could not extract enough text from page');
    }
    
    setStatus('Sending to AI for extraction...');
    loadingText.textContent = 'AI is analyzing the document...';
    
    const response = await chrome.runtime.sendMessage({
      action: 'extractCitations',
      data: {
        pageText: pageData.text,
        pageNumber: 1,
        fewShotExamples,
        memoryContext
      }
    });
    
    if (response.success && response.data) {
      const extracted = response.data.citations || [];
      if (extracted.length > 0) {
        citations = [...citations, ...extracted];
        renderTable();
        saveToStorage();
        setStatus(`Extracted ${extracted.length} citations`);
      } else {
        setStatus('No citations found on this page');
      }
    } else {
      throw new Error(response.error || 'Extraction failed');
    }
  } catch (error) {
    console.error('Extraction error:', error);
    setStatus('Extraction failed: ' + error.message);
  } finally {
    hideLoading();
  }
}

// Handle export button click
function handleExport() {
  if (citations.length === 0) {
    setStatus('No citations to export');
    return;
  }
  
  // Create CSV content
  const headers = COLUMNS.join(',');
  const rows = citations.map(row => 
    COLUMNS.map(col => {
      const value = row[col] || '';
      // Escape quotes and wrap in quotes if contains comma
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    }).join(',')
  );
  
  const csv = [headers, ...rows].join('\n');
  
  // Download file
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `citations_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  setStatus('Exported ' + citations.length + ' citations to CSV');
}

// Add empty row
function addEmptyRow() {
  const newRow = {};
  COLUMNS.forEach(col => newRow[col] = '');
  citations.push(newRow);
  renderTable();
  saveToStorage();
  setStatus('Added new row');
}

// Clear all citations
function handleClearAll() {
  if (citations.length === 0) return;
  
  if (confirm('Clear all ' + citations.length + ' citations?')) {
    citations = [];
    renderTable();
    saveToStorage();
    setStatus('Cleared all citations');
  }
}

// Delete a row
function deleteRow(index) {
  citations.splice(index, 1);
  renderTable();
  saveToStorage();
  setStatus('Deleted row');
}

// Render the table
function renderTable() {
  tableBody.innerHTML = '';
  
  if (citations.length === 0) {
    emptyState.classList.remove('hidden');
    rowCount.textContent = '0 rows';
    return;
  }
  
  emptyState.classList.add('hidden');
  rowCount.textContent = citations.length + ' row' + (citations.length !== 1 ? 's' : '');
  
  citations.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    
    COLUMNS.forEach(col => {
      const td = document.createElement('td');
      const textarea = document.createElement('textarea');
      textarea.className = 'cell-input';
      textarea.value = row[col] || '';
      textarea.rows = 1;
      
      // Auto-resize
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
        row[col] = textarea.value;
        saveToStorage();
      });
      
      td.appendChild(textarea);
      tr.appendChild(td);
    });
    
    // Delete button
    const actionTd = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>`;
    deleteBtn.onclick = () => deleteRow(rowIndex);
    actionTd.appendChild(deleteBtn);
    tr.appendChild(actionTd);
    
    tableBody.appendChild(tr);
  });
}

// Storage functions
function saveToStorage() {
  chrome.storage.local.set({ 
    citations, 
    fewShotExamples, 
    memoryContext 
  });
}

function loadFromStorage() {
  chrome.storage.local.get(['citations', 'fewShotExamples', 'memoryContext'], (result) => {
    citations = result.citations || [];
    fewShotExamples = result.fewShotExamples || [];
    memoryContext = result.memoryContext || {};
    renderTable();
  });
}

// UI helpers
function setStatus(message) {
  statusText.textContent = message;
}

function showLoading(message) {
  loadingText.textContent = message;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

console.log('Sidebar script loaded');
