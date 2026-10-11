// Frontend for the Dataset Quality Auditor.
// CSV parsing happens in the browser. Validation runs through the existing n8n webhook.
const WEBHOOK_URL = 'http://localhost:5678/webhook/validate-data';

const $ = (id) => document.getElementById(id);
const csvFile = $('csvFile');
const dropzone = $('dropzone');
const validateButton = $('validateButton');
const downloadButton = $('downloadButton');
let selectedFile = null;
let parsedRows = [];
let headers = [];
let latestErrors = [];
let latestSummary = null;
let toastTimer;

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

function parseCSV(text) {
  // Supports quoted values, escaped quotes, commas inside quotes, and newlines inside quoted values.
  const rows = [];
  let row = [], cell = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else {
      if (ch === '"' && cell.length === 0) quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
  }
  if (quoted) throw new Error('This CSV appears to contain an unclosed quotation mark.');
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  const nonEmptyRows = rows.filter(r => r.some(v => String(v).trim() !== ''));
  if (nonEmptyRows.length < 2) throw new Error('The CSV needs a header row and at least one data row.');
  const cols = nonEmptyRows[0].map((h, i) => String(h).trim() || `column_${i + 1}`);
  if (new Set(cols).size !== cols.length) throw new Error('Column names must be unique. Please rename duplicate headers.');
  const objects = nonEmptyRows.slice(1).map((values, idx) => {
    const obj = {};
    cols.forEach((header, i) => { obj[header] = values[i] === undefined ? '' : values[i]; });
    return obj;
  });
  return { headers: cols, rows: objects };
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function renderPreview() {
  $('previewCount').textContent = `${parsedRows.length} data row${parsedRows.length === 1 ? '' : 's'}`;
  $('previewHead').innerHTML = `<tr>${headers.map(h => `<th>${escapeHTML(h)}</th>`).join('')}</tr>`;
  const firstRows = parsedRows.slice(0, 5);
  $('previewBody').innerHTML = firstRows.map(row => `<tr>${headers.map(h => `<td title="${escapeHTML(row[h])}">${escapeHTML(row[h]) || '<span style="color:#b2bdc4">—</span>'}</td>`).join('')}</tr>`).join('');
  if (parsedRows.length > 5) {
    $('previewBody').insertAdjacentHTML('beforeend', `<tr><td colspan="${headers.length}" style="text-align:center;color:#8998a2">and ${parsedRows.length - 5} more rows…</td></tr>`);
  }
}

function resetReport() {
  latestErrors = [];
  latestSummary = null;
  $('totalRows').textContent = '—';
  $('validRows').textContent = '—';
  $('invalidRows').textContent = '—';
  $('totalErrors').textContent = '—';
  $('reportMessage').classList.remove('hidden');
  $('reportResults').classList.add('hidden');
  downloadButton.disabled = true;
}

async function loadFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
    showToast('Please choose a CSV file.');
    return;
  }
  try {
    const text = await file.text();
    const result = parseCSV(text);
    selectedFile = file;
    headers = result.headers;
    parsedRows = result.rows;
    $('fileTitle').textContent = file.name;
    $('fileSubtitle').textContent = 'File selected successfully';
    $('fileName').textContent = file.name;
    $('fileDetails').textContent = `${parsedRows.length} rows · ${headers.length} columns · ${(file.size / 1024).toFixed(1)} KB`;
    $('filePreview').classList.remove('hidden');
    dropzone.classList.add('hidden');
    validateButton.disabled = false;
    renderPreview();
    resetReport();
    showToast(`Loaded ${parsedRows.length} rows from ${file.name}.`);
  } catch (error) {
    showToast(error.message || 'Could not read this CSV file.');
  }
}

function buildRules() {
  const rules = {};
  const requiredEnabled = $('nameRequired').checked;
  const requiredFields = $('requiredFields').value.split(',').map(v => v.trim()).filter(Boolean);
  const minLength = Number($('minNameLength').value);
  const minAge = Number($('minAge').value);
  const maxAge = Number($('maxAge').value);
  const statuses = $('allowedStatuses').value.split(',').map(v => v.trim()).filter(Boolean);

  if (requiredEnabled) {
    requiredFields.forEach(field => {
      rules[field] = { ...(rules[field] || {}), required: true };
    });
  }
  if (headers.includes('name')) {
    rules.name = { ...(rules.name || {}), type: 'string', minLength: Number.isFinite(minLength) ? minLength : 2 };
  }
  if (headers.includes('email')) {
    rules.email = { ...(rules.email || {}), type: 'email' };
    if (requiredEnabled && requiredFields.includes('email')) rules.email.required = true;
  }
  if (headers.includes('age')) {
    rules.age = { ...(rules.age || {}), type: 'number' };
    if ($('minAge').value !== '') rules.age.min = minAge;
    if ($('maxAge').value !== '') rules.age.max = maxAge;
  }
  if (headers.includes('status') && statuses.length) {
    rules.status = { ...(rules.status || {}), enum: statuses };
  }
  return rules;
}

function showReport(response) {
  const summary = response.summary || {};
  latestSummary = summary;
  latestErrors = Array.isArray(response.errors) ? response.errors : [];
  $('totalRows').textContent = summary.totalRows ?? parsedRows.length;
  $('validRows').textContent = summary.validRows ?? '—';
  $('invalidRows').textContent = summary.invalidRows ?? '—';
  $('totalErrors').textContent = summary.totalErrors ?? latestErrors.length;
  $('reportMessage').classList.add('hidden');
  $('reportResults').classList.remove('hidden');
  const isValid = response.valid === true && latestErrors.length === 0;
  $('resultStatus').textContent = isValid ? 'PASSED' : 'ISSUES FOUND';
  $('resultStatus').className = `result-badge ${isValid ? 'good' : 'bad'}`;
  $('resultMessage').textContent = isValid ? 'All submitted records passed.' : 'Review the validation issues below.';
  $('resultRows').textContent = `${summary.totalRows ?? parsedRows.length} records checked`;
  $('errorsBody').innerHTML = latestErrors.map(error => {
    const value = error.value === null || error.value === undefined || error.value === '' ? '—' : error.value;
    return `<tr><td><span class="row-chip">${escapeHTML(error.row ?? '—')}</span></td><td><strong>${escapeHTML(error.field ?? '—')}</strong></td><td>${escapeHTML(value)}</td><td><span class="issue-rule">${escapeHTML(error.rule ?? '—')}</span></td><td>${escapeHTML(error.message ?? 'Validation issue')}</td></tr>`;
  }).join('');
  $('noErrorsMessage').classList.toggle('hidden', latestErrors.length !== 0);
  downloadButton.disabled = latestErrors.length === 0;
}

async function runAudit() {
  if (!parsedRows.length) { showToast('Upload a CSV file first.'); return; }
  validateButton.disabled = true;
  validateButton.innerHTML = 'Auditing dataset… <span>◌</span>';
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: parsedRows, rules: buildRules() })
    });
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); }
    catch { throw new Error(`n8n returned a non-JSON response (HTTP ${response.status}). Check the Respond with Report node.`); }
    if (!response.ok) throw new Error(result.message || `Request failed with HTTP ${response.status}.`);
    if (result.error && !result.summary) throw new Error(result.error);
    showReport(result);
    showToast(result.valid ? 'Audit complete. No validation issues found.' : `Audit complete. Found ${result.summary?.totalErrors ?? result.errors?.length ?? 0} issue(s).`);
    $('report').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    const message = error instanceof TypeError
      ? 'Could not connect to n8n. Check that n8n is running and the workflow is published. If the browser reports a CORS error, use the local server instructions in README.'
      : error.message;
    showToast(message);
    console.error(error);
  } finally {
    validateButton.disabled = !selectedFile;
    validateButton.innerHTML = 'Run data audit <span>→</span>';
  }
}

function downloadIssuesCSV() {
  if (!latestErrors.length) return;
  const columns = ['row', 'field', 'value', 'rule', 'message'];
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.join(','), ...latestErrors.map(error => columns.map(col => quote(error[col])).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dataset-audit-issues.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Issue report downloaded.');
}

csvFile.addEventListener('change', event => loadFile(event.target.files[0]));
$('removeFile').addEventListener('click', () => {
  selectedFile = null; parsedRows = []; headers = []; csvFile.value = '';
  $('filePreview').classList.add('hidden'); dropzone.classList.remove('hidden');
  $('fileTitle').textContent = 'Drop your CSV here';
  $('fileSubtitle').innerHTML = 'or <u>browse files</u> from your computer';
  $('previewCount').textContent = 'No file selected';
  $('previewHead').innerHTML = '<tr><th>Upload a CSV to preview its columns</th></tr>';
  $('previewBody').innerHTML = '<tr><td class="empty-cell">Your first rows will appear here.</td></tr>';
  validateButton.disabled = true;
  resetReport();
});
validateButton.addEventListener('click', runAudit);
downloadButton.addEventListener('click', downloadIssuesCSV);
dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', event => {
  event.preventDefault(); dropzone.classList.remove('dragging');
  const file = event.dataTransfer.files[0];
  if (file) loadFile(file);
});

// Friendly status note; actual connectivity is verified when an audit is run.
$('connectionText').textContent = 'Configured · localhost:5678';
