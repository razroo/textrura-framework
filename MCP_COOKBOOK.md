# Geometra MCP Cookbook

Optimal tool call sequences for common AI agent workflows. Each recipe shows the exact tools in order, key parameters, what to check in responses, and common pitfalls.

---

## 1. Fill a Greenhouse Job Application

Complete flow from page open to submit.

### Step 1 -- Connect with inline form schema

```json
geometra_connect({
  "pageUrl": "https://boards.greenhouse.io/company/jobs/123",
  "returnForms": true,
  "includeOptions": true,
  "returnPageModel": true
})
```

**Check:** `formCount > 0` in response. Note the `schemaId` and `formId` for later. If `captcha` is present in the page model, see Recipe 4.

### Step 2 -- Fill the form in one call

```json
geometra_fill_form({
  "formId": "fm:1.0",
  "valuesByLabel": {
    "First Name": "Jane",
    "Last Name": "Doe",
    "Email": "jane@example.com",
    "Phone": "555-0100",
    "LinkedIn URL": "https://linkedin.com/in/janedoe",
    "How did you hear about us?": "Referral"
  },
  "skipPreFilled": false,
  "verifyFills": true
})
```

**Check:** `completed: true`, `errorCount: 0`. If `verification.mismatches` is non-empty, a field rejected input (see Recipe 7). If `stoppedAt` is present, resume from `resumeFromIndex` (see Recipe 6).

### Step 3 -- Upload resume

```json
geometra_upload_files({
  "paths": ["/Users/you/resume.pdf"],
  "fieldLabel": "Resume"
})
```

**Check:** Response confirms file count. If the error says "no file input found by label", retry with `strategy: "hidden"`.

### Step 4 -- Wait for resume parsing

```json
geometra_wait_for_resume_parse({
  "text": "Parsing",
  "timeoutMs": 15000
})
```

**Check:** Success means the parsing banner disappeared. If it times out, the site may not show a banner -- continue anyway.

### Step 5 -- Re-check form after parse (fields may be pre-filled)

```json
geometra_form_schema({
  "formId": "fm:1.0",
  "includeOptions": true
})
```

**Check:** Compare field values. Resume parsing may have filled some fields. Only fill remaining gaps.

### Step 6 -- Verify and click Submit

```json
geometra_click({
  "name": "Submit Application",
  "role": "button",
  "waitFor": {
    "text": "Application submitted",
    "timeoutMs": 10000
  }
})
```

**Check:** `postWait` confirms the success message appeared. If the button is disabled, check `final.invalidFields` from the last fill response for missing required fields.

### Pitfalls

- Greenhouse sometimes uses custom dropdowns for location/department. If `fill_form` errors on a choice field with "no option found", fall back to `geometra_pick_listbox_option` (Recipe 3).
- The Submit button may say "Submit", "Submit Application", or "Apply" -- use `geometra_find_action` if unsure.
- Some Greenhouse forms split into sections behind "Continue" buttons -- that makes it multi-page (see Recipe 2).

---

## 2. Fill a Multi-Page Workday Application

Workday applications span several pages (Personal Info, Experience, Voluntary Disclosures, etc.).

### Step 1 -- Connect

```json
geometra_connect({
  "pageUrl": "https://company.wd5.myworkdayjobs.com/careers/job/Location/Title_ID/apply",
  "returnForms": true,
  "returnPageModel": true,
  "includeOptions": true
})
```

**Check:** Page model `archetypes` -- Workday often shows as `["form", "wizard"]`. Note `formCount`.

### Step 2 -- Fill page 1

```json
geometra_fill_form({
  "formId": "fm:1.0",
  "valuesByLabel": {
    "First Name": "Jane",
    "Last Name": "Doe",
    "Email Address": "jane@example.com",
    "Phone Number": "555-0100",
    "Country": "United States"
  },
  "skipPreFilled": true,
  "failOnInvalid": true,
  "includeSteps": true
})
```

**Check:** `completed: true`. If `failOnInvalid` triggered, inspect `final.invalidFields` for missing required fields.

### Step 3 -- Click Next

```json
geometra_click({
  "name": "Next",
  "role": "button"
})
```

### Step 4 -- Wait for navigation

```json
geometra_wait_for_navigation({
  "timeoutMs": 15000
})
```

**Check:** `navigated: true`. The response includes `formCount` for the new page and a page model summary. If `navigated: false`, the page may validate inline -- check for error alerts.

### Step 5 -- Check workflow state

```json
geometra_workflow_state({})
```

**Check:** `pageCount` should show the completed page(s). `totalInvalidRemaining` should be 0 for filled pages.

### Step 6 -- Get new page form schema

```json
geometra_form_schema({
  "includeOptions": true
})
```

### Step 7 -- Fill page 2

```json
geometra_fill_form({
  "valuesByLabel": {
    "How did you hear about us?": "LinkedIn",
    "Are you legally authorized to work in the United States?": "Yes"
  },
  "skipPreFilled": true
})
```

### Step 8 -- Repeat steps 3-7 for each page

Continue the `click Next -> wait_for_navigation -> form_schema -> fill_form` loop until you reach the review/submit page.

### Step 9 -- Final submit

```json
geometra_click({
  "name": "Submit",
  "role": "button",
  "waitFor": {
    "text": "submitted",
    "timeoutMs": 20000
  }
})
```

### Pitfalls

- Workday pages can be slow. Use `timeoutMs: 15000` or higher on `wait_for_navigation`.
- Country/state fields are often custom listboxes. If `fill_form` fails on those, use `geometra_pick_listbox_option` with a `query`.
- Workday sometimes requires scrolling to reveal fields. If a field fill fails with "not visible", call `geometra_reveal` with the field name first.
- The "Next" button text varies: "Next", "Continue", "Save and Continue". Use `geometra_find_action` to locate it.

---

## 3. Handle a Custom Dropdown (Lever/Ashby)

Custom dropdowns (React Select, Headless UI, Radix, Ashby-style) don't work with native `<select>` -- use `geometra_pick_listbox_option`.

### Step 1 -- Identify the listbox field from form schema

```json
geometra_form_schema({
  "includeOptions": true
})
```

**Check:** Look for fields with `type: "combobox"` or `type: "listbox"`. Note the `label` and available `options`.

### Step 2 -- Pick the option

```json
geometra_pick_listbox_option({
  "fieldLabel": "Location",
  "label": "New York, NY",
  "query": "New York"
})
```

**Parameters:**
- `fieldLabel` -- the form field label from the schema (e.g., "Location", "Department")
- `label` -- the option text to select (supports fuzzy/alias matching: "US" matches "United States")
- `query` -- text to type into a searchable combobox before selecting (triggers remote search for async options)

**Check:** Response includes `readback` with the confirmed field value. If the pick fails, the error payload includes `visibleOptions` showing what options are actually available -- use one of those labels to retry.

### Step 3 -- Retry with exact option text (if needed)

```json
geometra_pick_listbox_option({
  "fieldLabel": "Location",
  "label": "New York, New York, United States",
  "exact": true
})
```

### When to use `geometra_select_option` instead

Only for native HTML `<select>` elements. If `form_schema` shows `type: "select"`, use:

```json
geometra_select_option({
  "x": 400,
  "y": 300,
  "label": "United States"
})
```

### Pitfalls

- If the dropdown loads options asynchronously (common for location pickers), always pass `query` to trigger the search, and increase `timeoutMs` to 8000+.
- Some dropdowns open on focus, not click. `pick_listbox_option` handles this automatically via `fieldLabel`.
- If the same label appears in multiple dropdowns (e.g., two "Location" fields), use `sectionText` or `contextText` to disambiguate.

---

## 4. Handle CAPTCHA Detection

Detect CAPTCHAs early and bail with a clear message rather than wasting tool calls.

### Step 1 -- Connect with page model

```json
geometra_connect({
  "pageUrl": "https://jobs.example.com/apply/123",
  "returnPageModel": true
})
```

### Step 2 -- Check for CAPTCHA

**Check the response for `captcha` in the page model.**

The page model includes a `captcha` field when a CAPTCHA is detected:

```json
{
  "captcha": {
    "kind": "recaptcha-v2",
    "visible": true
  }
}
```

### Step 3 -- If CAPTCHA detected, bail early

If `captcha` is present and `visible: true`, stop automation and return a message to the human:

> "This page requires a CAPTCHA (reCAPTCHA v2). Please complete the CAPTCHA manually, then tell me to continue."

### Step 4 -- After human completes CAPTCHA, verify and continue

```json
geometra_page_model({})
```

**Check:** `captcha` should be absent or `visible: false`. Then proceed with `form_schema` and `fill_form`.

### Alternative -- Invisible CAPTCHA

If `captcha.kind` is `"recaptcha-v3"` or `visible: false`, the CAPTCHA is invisible/automatic. Proceed normally -- it will resolve on submit. Only bail for visible challenge CAPTCHAs.

### Pitfalls

- CAPTCHAs can appear after clicking Submit, not just on page load. After any submit click, check the page model again.
- Some sites use hCaptcha or Turnstile instead of reCAPTCHA -- the `kind` field will reflect the type.

---

## 5. Resume Upload + Parse Wait

Upload a resume, wait for the ATS to finish parsing, then fill remaining fields without overwriting parsed data.

### Step 1 -- Upload the resume

```json
geometra_upload_files({
  "paths": ["/Users/you/resume.pdf"],
  "fieldLabel": "Resume/CV",
  "timeoutMs": 10000
})
```

**Check:** Confirm upload succeeded. If `fieldLabel` fails, try without it (auto-detects the file input) or use `strategy: "hidden"`.

### Step 2 -- Wait for parse completion

```json
geometra_wait_for_resume_parse({
  "text": "Parsing",
  "timeoutMs": 20000
})
```

**Tune `text` per site:**
- Greenhouse: `"Parsing"`
- Lever: `"Uploading"` or `"Processing"`
- Ashby: `"Parsing your resume"`
- Workday: often no banner (skip this step)

### Step 3 -- Get updated form schema

```json
geometra_form_schema({
  "includeOptions": true
})
```

**Check:** Fields that were empty before may now have values from the parsed resume (name, email, phone, etc.).

### Step 4 -- Fill remaining fields, skipping pre-filled ones

```json
geometra_fill_form({
  "valuesByLabel": {
    "First Name": "Jane",
    "Last Name": "Doe",
    "Email": "jane@example.com",
    "Phone": "555-0100",
    "LinkedIn URL": "https://linkedin.com/in/janedoe"
  },
  "skipPreFilled": true
})
```

**Check:** `skippedPreFilled` in the response shows how many fields were skipped because parsing already filled them correctly.

### Pitfalls

- Upload the resume BEFORE filling text fields. Many ATS platforms overwrite all fields when parsing completes, erasing your previous fills.
- If there's no parsing banner visible (some sites parse instantly or silently), skip step 2. Just wait a beat with `geometra_wait_for` on a field you expect to become non-empty:
  ```json
  geometra_wait_for({ "name": "First Name", "role": "textbox", "timeoutMs": 5000 })
  ```
- Cover letters are separate uploads. Use a second `upload_files` call with `fieldLabel: "Cover Letter"`.

---

## 6. Recover from Fill Errors

When `geometra_fill_form` or `geometra_fill_fields` stops on an error, check the suggestion and retry with the recommended tool.

### Step 1 -- Initial fill attempt

```json
geometra_fill_form({
  "valuesByLabel": {
    "First Name": "Jane",
    "Location": "NYC",
    "Resume": "/Users/you/resume.pdf"
  },
  "stopOnError": true,
  "includeSteps": true
})
```

### Step 2 -- Check the error

If a field fails, the response includes `stoppedAt` and a `suggestion` on the failing step:

```json
{
  "completed": false,
  "stoppedAt": 1,
  "resumeFromIndex": 2,
  "steps": [
    { "index": 0, "kind": "text", "ok": true },
    {
      "index": 1,
      "kind": "choice",
      "ok": false,
      "error": "No option matching 'NYC' found in select",
      "suggestion": "Try geometra_pick_listbox_option with fieldLabel=\"Location\" and label=\"NYC\" for custom dropdowns."
    }
  ]
}
```

### Step 3 -- Follow the suggestion

```json
geometra_pick_listbox_option({
  "fieldLabel": "Location",
  "label": "NYC",
  "query": "New York"
})
```

### Step 4 -- Resume the fill from where it stopped

```json
geometra_fill_form({
  "valuesByLabel": {
    "Resume": "/Users/you/resume.pdf"
  },
  "resumeFromIndex": 2
})
```

### Common suggestions by error type

| Error | Suggestion | Action |
|---|---|---|
| "No option matching X" on a choice field | Use `geometra_pick_listbox_option` | Switch to listbox tool with `query` |
| "Timeout" on a choice field | Increase `timeoutMs` or use `pick_listbox_option` with `query` | Retry with longer timeout |
| "No textbox found for label X" | Field may be a non-standard control | Use `geometra_query` to find the field, then `geometra_click` + `geometra_type` |
| "No file input found by label" | Use `geometra_upload_files` with `strategy: "hidden"` | Retry with hidden strategy or click coordinates |
| "Action timed out" (generic) | Page may still be loading | Call `geometra_wait_for` with a loading indicator, then retry |

### Pitfalls

- Do not set `stopOnError: false` for critical forms. It will skip errored fields silently, and you may submit an incomplete application.
- When resuming with `resumeFromIndex`, the form schema may have changed (e.g., conditional fields appeared). Re-fetch with `geometra_form_schema` if the resume attempt also fails.

---

## 7. Low-Confidence Fill Review

Use `verifyFills` to catch fields where the ATS silently rejected or transformed input (e.g., autocomplete replaced your text, phone format changed).

### Step 1 -- Fill with verification enabled

```json
geometra_fill_form({
  "valuesByLabel": {
    "First Name": "Jane",
    "Last Name": "Doe",
    "Phone": "(555) 010-0100",
    "City": "NYC"
  },
  "verifyFills": true
})
```

### Step 2 -- Check the verification results

The response includes a `verification` object:

```json
{
  "completed": true,
  "verification": {
    "verified": 4,
    "mismatches": [
      {
        "fieldLabel": "Phone",
        "expected": "(555) 010-0100",
        "actual": "5550100100",
        "fieldId": "phone_field"
      },
      {
        "fieldLabel": "City",
        "expected": "NYC",
        "actual": "",
        "fieldId": "city_field"
      }
    ]
  }
}
```

### Step 3 -- Handle mismatches

**Phone reformatted:** Usually harmless. If `actual` contains the same digits, the site reformatted to its preferred format. No action needed.

**City empty/wrong:** The field rejected the input (possibly a listbox, not a textbox). Fix it:

```json
geometra_pick_listbox_option({
  "fieldLabel": "City",
  "label": "New York",
  "query": "New York"
})
```

### Step 4 -- Check `minConfidence` for proactive review

The response also includes `minConfidence` (0.0 to 1.0):

```json
{
  "completed": true,
  "minConfidence": 0.65,
  "fieldCount": 8
}
```

**Confidence thresholds:**
- `>= 0.9` -- high confidence, likely correct
- `0.7 - 0.9` -- moderate, worth a quick check
- `< 0.7` -- low confidence. Some fields matched by fuzzy label. Review the fill plan with `includeSteps: true` and check `matchMethod` on each step (e.g., `"exact"` vs `"fuzzy"` vs `"alias"`)

### Step 5 -- Flag for human review if confidence is low

If `minConfidence < 0.7` or `mismatches` are non-empty and the actual value is empty/wrong:

> "Some fields may not have filled correctly. Please review: Phone (reformatted to 5550100100), City (could not fill -- may need manual selection). Confidence: 0.65."

### Pitfalls

- `verifyFills` only checks text and choice fields, not toggles or file uploads. Verify those separately with `geometra_query` if needed.
- Autocomplete can replace your value after a brief delay. If you suspect this, add a `geometra_wait_for` with `value` set to your expected text before verifying.
- Some sites format phone numbers, dates, or SSNs on blur. A mismatched `actual` is not always an error -- compare the semantic content, not the exact string.

---

## Native vs Proxy: When to Use Each

Geometra MCP has two connection modes. Every recipe above uses the **proxy** path (Chromium + Playwright). Recipes 8-10 below use the **native** path (direct WebSocket to a Geometra server).

| | Native | Proxy |
|---|---|---|
| **Connect with** | `url: "ws://localhost:3100"` | `pageUrl: "https://..."` |
| **Browser needed** | No | Yes (Chromium auto-spawned) |
| **Form-fill tools** | Click + type + key only | `fill_form`, `fill_fields`, `pick_listbox_option`, etc. |
| **Best for** | Geometra-native apps, agent-first UX, multi-agent | Existing websites, ATS automation |
| **Startup time** | Instant | 2-5s (browser launch) |

**Choose native when** you're building a new Geometra app and want agents as first-class users. Choose proxy when automating an existing website.

See `NATIVE_MCP_GUIDE.md` for the full tool compatibility matrix.

---

## 8. Drive a Native Geometra App

Connect to a running Geometra server (no browser, no proxy) and interact through semantic tools.

**Prerequisite:** Start the CRUD demo server:
```bash
cd demos/mcp-native-crud && npm run server
```

### Step 1 -- Connect

```json
geometra_connect({
  "url": "ws://localhost:3100"
})
```

**Check:** Connection confirms with session info. No browser is launched.

### Step 2 -- Discover the UI

```json
geometra_page_model({})
```

Returns buttons ("Add Task", filter buttons), a task list, status text. The agent now understands the app structure.

### Step 3 -- Add a task

```json
geometra_click({ "role": "button", "name": "Add Task" })
```

Opens the edit form with a title input and priority selector.

### Step 4 -- Focus and type

```json
geometra_click({ "role": "textbox" })
geometra_type({ "text": "Review pull request" })
```

The server receives each keystroke, updates its signal state, and broadcasts the new frame.

### Step 5 -- Save

```json
geometra_click({ "role": "button", "name": "Save" })
```

### Step 6 -- Verify

```json
geometra_query({ "role": "status" })
```

**Check:** Response text should be "Task created: Review pull request".

### Step 7 -- Snapshot the result

```json
geometra_snapshot({})
```

Shows the updated task list with the new task visible.

### Pitfalls

- Always call `geometra_click` on the textbox before `geometra_type` -- the server routes key events to the focused element.
- If `geometra_type` has no effect, verify with `geometra_snapshot` that the input is focused.
- Use `geometra_query({ role: "status" })` to verify actions rather than relying on the snapshot alone.

---

## 9. Full CRUD Cycle on a Native App

A complete add / filter / edit / delete workflow with verification between each step.

**Prerequisite:** The CRUD demo server is running on `ws://localhost:3100`.

### Add a task

```json
geometra_connect({ "url": "ws://localhost:3100" })
geometra_click({ "role": "button", "name": "Add Task" })
geometra_click({ "role": "textbox" })
geometra_type({ "text": "Deploy to staging" })
geometra_click({ "role": "button", "name": "Save" })
geometra_query({ "role": "status" })
```

**Check:** Status = "Task created: Deploy to staging"

### Filter to active tasks

```json
geometra_click({ "role": "button", "name": "Filter Active" })
geometra_snapshot({})
```

**Check:** Only uncompleted tasks appear.

### Toggle a task as done

```json
geometra_click({ "role": "checkbox", "name": "Deploy to staging" })
geometra_query({ "role": "status" })
```

**Check:** Status = "Task completed: Deploy to staging". The task disappears from the active filter.

### Switch to done filter

```json
geometra_click({ "role": "button", "name": "Filter Done" })
geometra_snapshot({})
```

**Check:** "Deploy to staging" now appears in the done list.

### Edit a task

```json
geometra_click({ "role": "button", "name": "Filter All" })
geometra_click({ "role": "button", "name": "Edit Deploy to staging" })
```

The edit form opens with the title pre-filled.

```json
geometra_click({ "role": "textbox" })
geometra_key({ "key": "Meta+a" })
geometra_type({ "text": "Deploy to production" })
geometra_click({ "role": "button", "name": "Save" })
geometra_query({ "role": "status" })
```

**Check:** Status = "Task updated: Deploy to production"

### Delete a task

```json
geometra_click({ "role": "button", "name": "Delete Deploy to production" })
geometra_query({ "role": "status" })
```

**Check:** Status = "Task deleted: Deploy to production"

### Pitfalls

- Edit and Delete buttons include the task title in their `ariaLabel` (e.g., "Edit Deploy to staging"). Use the full name to target the right task when multiple tasks exist.
- After toggling a checkbox, the task may disappear if a filter is active. Switch to "All" first if you need to interact with it further.

---

## 10. Multi-Agent Shared Geometry

Two agents connect to the same native server and see each other's changes in real time.

### Agent A -- create tasks

```json
geometra_connect({ "url": "ws://localhost:3100" })
geometra_click({ "role": "button", "name": "Add Task" })
geometra_click({ "role": "textbox" })
geometra_type({ "text": "Write unit tests" })
geometra_click({ "role": "button", "name": "Save" })
```

### Agent B -- observe and act (separate MCP session)

```json
geometra_connect({ "url": "ws://localhost:3100" })
geometra_snapshot({})
```

Agent B sees the task that Agent A just created. Now B marks it done:

```json
geometra_click({ "role": "checkbox", "name": "Write unit tests" })
```

### Agent A -- verify B's action

```json
geometra_snapshot({})
```

Agent A sees the task is now checked. No polling needed -- `snapshot` reads the latest frame, and the server broadcasts every `update()` to all clients.

### How it works

Each `geometra_connect` creates an independent MCP session, but they share the same app state on the server. When any client (human or agent) triggers an action, the server:
1. Updates its signals
2. Calls `server.update()`
3. Recomputes layout via Yoga
4. Broadcasts the new frame to all connected WebSocket clients

MCP sessions receive the updated frame automatically. The next tool call from any agent reads the latest state.

### Pitfalls

- Concurrent writes to the same field are last-write-wins. There is no conflict resolution -- the last agent to trigger an action determines the state.
- If two agents click the same button simultaneously, both actions fire. Design your state transitions to be idempotent where possible.

---

## Troubleshooting

Common errors and how to resolve them.

### "Connection refused" or timeout on connect

The server isn't running, or you're using the wrong port/URL.

- **Native:** Verify the server process is running and check the port. Default is `ws://localhost:3100`.
- **Proxy:** Verify the URL is reachable from your machine. Try `curl -I <url>` first.

### "Not connected" on any tool call

You must call `geometra_connect` before using any other tool. Each MCP session starts disconnected.

### "Client message type X is not supported on the native Textura server"

You called a proxy-only tool (`fill_form`, `fill_fields`, `set_checked`, `select_option`, `pick_listbox_option`, `upload_files`, `wheel`) on a native Geometra server. Use `click` + `type` + `key` instead. See the tool compatibility matrix in `NATIVE_MCP_GUIDE.md`.

### Element not found (no match for role/name)

The element doesn't exist, isn't visible, or has a different name than expected.

1. Run `geometra_snapshot({ "view": "full" })` to see the complete tree
2. Check element roles with `geometra_query({ "role": "button" })` to list all buttons
3. If using `name`, try a substring: `geometra_query({ "text": "Submit" })` instead of an exact name match

### Stale state after action

If `geometra_snapshot` shows old state after an action, the server may not have called `server.update()`. This is a server-side bug in the app being automated.

For proxy connections, the page may still be loading. Use `geometra_wait_for` with a condition that indicates the update completed.

### Type has no effect

The target element isn't focused. Click the input/textbox first:

```json
geometra_click({ "role": "textbox", "name": "Title" })
geometra_type({ "text": "hello" })
```

On native servers, the input component must have an `onKeyDown` handler wired up -- see `NATIVE_MCP_GUIDE.md` section 5.
