/**
 * view-setup-template.ts
 *
 * Generates the "Configure project views" tracking issue for any new GitHub Project.
 * Called automatically by create_project — produces a step-by-step checklist that
 * covers everything the API cannot do (view creation, grouping, column layout).
 *
 * Usage:
 *   import { buildViewSetupIssue } from "./view-setup-template.js";
 *   const { title, body } = buildViewSetupIssue(config);
 */

export interface FieldOption {
  id: string;
  name: string;
}

export interface ProjectField {
  id: string;
  name: string;
  type: "SINGLE_SELECT" | "DATE" | "TEXT" | "NUMBER";
  options?: FieldOption[];
}

export interface ViewSetupConfig {
  projectTitle: string;
  projectNumber: number;
  projectUrl: string;
  projectId: string;
  fields: ProjectField[];
  /** Which field to use as Board columns (default: Status) */
  boardGroupField?: string;
  /** Which field to use for Roadmap start date (default: first DATE field) */
  roadmapStartField?: string;
  /** Which field to use for Roadmap target date (default: second DATE field) */
  roadmapTargetField?: string;
  /** Which field to use for Roadmap swim lanes (default: Priority or first SINGLE_SELECT) */
  roadmapLaneField?: string;
  /** Extra views to create beyond the standard 3 */
  extraViews?: ExtraView[];
}

export interface ExtraView {
  name: string;
  type: "table" | "board" | "roadmap";
  description: string;
  groupBy?: string;
  filterBy?: string;
  sortBy?: string;
  showFields?: string[];
}

export function buildViewSetupIssue(config: ViewSetupConfig): { title: string; body: string } {
  const {
    projectTitle,
    projectNumber,
    projectUrl,
    projectId,
    fields,
  } = config;

  const statusField    = fields.find(f => f.name === "Status");
  const priorityField  = fields.find(f => f.name === "Priority");
  const dateFields     = fields.filter(f => f.type === "DATE");
  const startDateField = dateFields.find(f => /start/i.test(f.name)) ?? dateFields[0];
  const targetDateField= dateFields.find(f => /target|end|due/i.test(f.name)) ?? dateFields[1];
  const boardGroup     = config.boardGroupField ?? statusField?.name ?? "Status";
  const laneField      = config.roadmapLaneField ?? priorityField?.name ?? "Priority";

  const selectFields   = fields.filter(f => f.type === "SINGLE_SELECT");
  const allFieldNames  = fields.map(f => `\`${f.name}\``).join(", ");

  // Status options block
  const statusBlock = statusField?.options?.length
    ? statusField.options.map(o => `  - \`${o.id}\` → **${o.name}**`).join("\n")
    : "  _(No options found — add via UI)_";

  // Field ID reference block
  const fieldRefBlock = fields
    .map(f => {
      const optLines = f.options?.map(o => `    - ${o.name} → \`${o.id}\``).join("\n") ?? "";
      return `- **${f.name}** (\`${f.id}\`)\n${optLines}`;
    })
    .join("\n");

  // Extra views section
  const extraViewsBlock = config.extraViews?.length
    ? config.extraViews.map((v, i) => `
### View ${i + 4}: ${v.name} (${v.type})
${v.description}

- [ ] Click **+ New view** → choose **${v.type === "board" ? "Board" : v.type === "roadmap" ? "Roadmap" : "Table"}**
- [ ] Name it **"${v.name}"**${v.groupBy ? `\n- [ ] Set **Group by** → **${v.groupBy}**` : ""}${v.filterBy ? `\n- [ ] Add filter: \`${v.filterBy}\`` : ""}${v.sortBy ? `\n- [ ] Sort by **${v.sortBy}**` : ""}${v.showFields ? `\n- [ ] Show fields: ${v.showFields.map(f => `**${f}**`).join(", ")}` : ""}
- [ ] Click **Save**
`).join("")
    : "";

  const title = `⚙️ Configure views for: ${projectTitle}`;

  const body = `## Overview
This issue tracks the manual view setup for **[${projectTitle}](${projectUrl})** (Project #${projectNumber}).

The GitHub Projects API cannot create views, set grouping, or configure column layout — those steps must be done in the UI. This checklist ensures every project gets a consistent, fully configured workspace.

> **Project ID for API calls:** \`${projectId}\`

---

## Field Reference
These are the fields available on this project. IDs are needed when calling \`update_project_item\` or \`bulk_update_project_items\`.

${fieldRefBlock}

---

## View 1: 📋 Table (default)

The main overview — all items visible, sorted by priority.

- [ ] Rename the default view to **"Table"** (click the tab name → edit)
- [ ] Click **Group by** → select **${boardGroup}**
- [ ] Open **Fields** settings → ensure all fields are visible: ${allFieldNames}
- [ ] Click **Sort** → **Priority** ascending
- [ ] Click **Save**

---

## View 2: 🗂️ Board — by Status

Kanban-style board with columns per ${boardGroup} option.

- [ ] Click **+ New view** at the top of the project
- [ ] Choose layout: **Board**
- [ ] Name it **"Board"**
- [ ] Set **Group by** → **${boardGroup}**
${statusField?.options ? `- [ ] Verify all columns appear:\n${statusField.options.map(o => `  - [ ] ${o.name}`).join("\n")}` : ""}
- [ ] Open **Fields** → hide body text, show: ${selectFields.map(f => `**${f.name}**`).join(", ")}
- [ ] Click **Save**

---

## View 2b: 👤 Board — by Assignee (swim lanes)

Same board layout but sliced by who owns the work. This is how you separate human tasks from agent tasks at a glance.

- [ ] Click **+ New view** → choose **Board**
- [ ] Name it **"By Assignee"**
- [ ] Set **Group by** → **Assignees**
- [ ] Set **Column by** → **${boardGroup}** (so columns are still Status)
- [ ] Open **Fields** → show: ${selectFields.map(f => `**${f.name}**`).join(", ")}
- [ ] Click **Save**

> **Convention:** Issues assigned to **Mxcks** are human tasks. Issues assigned to **mxcksaiworkspace-art** have an embedded 🤖 agent prompt in their body — paste it into a new Copilot chat to start that work.

---

## View 3: 🗓️ Roadmap
${startDateField && targetDateField ? `
Time-based view showing work scheduled across dates.

- [ ] Click **+ New view** → choose **Roadmap**
- [ ] Name it **"Roadmap"**
- [ ] Click **Date fields** → set:
  - Start date: **${startDateField.name}**
  - Target date: **${targetDateField.name}**
- [ ] Set **Group by** (swim lanes) → **${laneField}**
- [ ] Set zoom level: **Month**
- [ ] Click **Save**

> If no items appear as bars, open an item and confirm its **${startDateField.name}** and **${targetDateField.name}** fields have values set. Use \`set_item_date\` or \`bulk_update_project_items\` to populate them.
` : `
> ⚠️ No DATE fields found on this project. To enable Roadmap view:
> 1. Use \`create_project_field\` to create \`Start Date\` (DATE) and \`Target Date\` (DATE) fields
> 2. Populate them with \`bulk_update_project_items\`
> 3. Then create the Roadmap view as above
`}

---
${extraViewsBlock}
## View Settings (apply to all views)

- [ ] **Workflows** — Click ⚙️ → Workflows → enable:
  - [ ] Auto-add items: _Item added to repository → add to project_
  - [ ] Auto-close: _Item closed → set Status to Done_
- [ ] **Insights** — Click 📊 → confirm "Current iteration" chart is available
- [ ] **Limit** — On Board view, consider setting WIP limits per column (UI only)

---

## API Quick-Start

Once views are configured, use these to update items without the browser:

\`\`\`jsonc
// Update a single item's status
{
  "tool": "update_project_item",
  "projectId": "${projectId}",
  "itemId": "PVTI_...",
  "fieldId": "${statusField?.id ?? "<STATUS_FIELD_ID>"}",
  "value": "<OPTION_ID>"
}

// Update multiple items at once
{
  "tool": "bulk_update_project_items",
  "projectId": "${projectId}",
  "updates": [
    { "itemId": "PVTI_...", "fieldId": "${statusField?.id ?? "<STATUS_FIELD_ID>"}",   "value": "<status_option_id>",   "type": "singleSelect" },
    { "itemId": "PVTI_...", "fieldId": "${startDateField?.id ?? "<START_DATE_ID>"}",  "value": "2026-03-01",           "type": "date" }
  ]
}
\`\`\`

---

## Status options
${statusBlock}

---

_Close this issue once all views are saved and workflow automations are enabled._
`;

  return { title, body };
}
