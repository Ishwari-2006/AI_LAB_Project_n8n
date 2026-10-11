# Dataset Quality Auditor — Frontend

A lightweight HTML/CSS/JavaScript interface for your existing n8n workflow.

## Files
- `index.html` — page structure
- `styles.css` — responsive styling
- `app.js` — CSV parsing, rule configuration, webhook call, report rendering, and CSV export
- `sample_dataset.csv` — sample file for your first test

## Important: keep n8n running
Your existing production webhook is configured in `app.js` as:

`http://localhost:5678/webhook/validate-data`

The workflow must be **published/active** and n8n must be running.

## Run on Windows using CMD
1. Extract this folder somewhere convenient, for example `C:\Users\ISHWARI\Desktop\dataset_quality_auditor_frontend`.
2. Open CMD and move into that folder (adjust path if needed):

   `cd /d C:\Users\ISHWARI\Desktop\dataset_quality_auditor_frontend`

3. Start a small local web server. If Python is installed:

   `py -m http.server 8000`

   If `py` is not recognized, try:

   `python -m http.server 8000`

4. Open this address in your browser:

   `http://localhost:8000`

5. Choose `sample_dataset.csv`, review the preview and settings, then click **Run data audit**.

Keep the CMD window open while using the frontend. Press `Ctrl+C` in that window to stop the server.

## If the browser says it cannot connect
- Confirm n8n is running and `http://localhost:5678/webhook/validate-data` is the correct published production URL.
- Test the webhook in CMD first, as you already did.
- If the browser console shows a CORS error, the browser is blocking a request from port 8000 to port 5678. Configure CORS in your n8n deployment or use the same-origin proxy approach described below. Do not switch to the webhook-test URL; keep the production webhook.

### Optional same-origin proxy if CORS blocks the browser
If you run n8n with a supported reverse proxy, serve the frontend and proxy `/webhook/` requests through that same origin. For a local college demo, configure the proxy so `http://localhost:8000/webhook/validate-data` forwards to `http://localhost:5678/webhook/validate-data`, then change `WEBHOOK_URL` in `app.js` to `/webhook/validate-data`. This avoids browser cross-origin restrictions. Do not use this change unless your proxy is configured.

## What the interface does
- Parses a CSV in the browser and previews the first five rows.
- Sends the records as `{ "data": [...], "rules": {...} }` to the existing n8n webhook.
- Lets you configure required fields, minimum name length, age bounds, and allowed status values.
- Displays the summary and detailed row/field/rule/message errors returned by n8n.
- Exports issues to `dataset-audit-issues.csv`.

## Notes about rule behavior
- The current n8n code checks duplicate emails automatically.
- Custom rules are sent for columns named `name`, `email`, `age`, and `status`; the UI only adds these field rules when those headers exist.
- Required columns are configurable with a comma-separated list.
- The n8n code's `enum` comparison is exact and case-sensitive.
- This interface assumes a CSV with a header row and unique column names.
