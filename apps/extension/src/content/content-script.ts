// Extracts issue details from GitHub DOM
function extractIssueContext() {
  const titleEl = document.querySelector('.gh-header-title, [data-component="issue-title"]');
  const bodyEl = document.querySelector('.comment-body, .timeline-comment--caret .edit-comment-hide');
  const labelEls = document.querySelectorAll('.IssueLabel, [data-testid="issue-labels"] a');

  const title = titleEl?.textContent?.trim() || '';
  const body = bodyEl?.textContent?.trim() || '';
  const labels = Array.from(labelEls).map((el) => el.textContent?.trim() || '');

  return { title, body, labels };
}

// Listen for query requests from side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'EXTRACT_DOM_CONTEXT') {
    const details = extractIssueContext();
    sendResponse(details);
  }
  return true;
});
