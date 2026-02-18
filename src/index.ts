#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { graphql } from "@octokit/graphql";
import * as dotenv from "dotenv";
import https from "https";
import { chromium, Browser, Page } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load .env from the same directory as this script
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const TOKEN = process.env.AI_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
const OWNER = process.env.AI_GITHUB_USERNAME || process.env.GITHUB_OWNER || "mxcksaiworkspace-art";
const REPO = process.env.GITHUB_REPO || "Research-Lab";

if (!TOKEN) {
  throw new Error("AI_GITHUB_TOKEN or GITHUB_TOKEN must be set in .env");
}

const gql = graphql.defaults({
  headers: { authorization: `token ${TOKEN}` },
});

function restRequest(method: string, path: string, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: "api.github.com",
      path,
      method,
      headers: {
        Authorization: `token ${TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "github-projects-mcp/2.0",
        Accept: "application/vnd.github+json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => raw += c);
      res.on("end", () => {
        const parsed = raw ? JSON.parse(raw) : {};
        if (res.statusCode && res.statusCode >= 400) reject(new Error(parsed.message || JSON.stringify(parsed)));
        else resolve(parsed);
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const restPost  = (path: string, body: object) => restRequest("POST",  path, body);
const restPatch = (path: string, body: object) => restRequest("PATCH", path, body);
const restGet   = (path: string)               => restRequest("GET",   path);

// ─── Browser state (connects to existing Brave session) ─────────────────────

let browser: Browser | null = null;
let page: Page | null = null;

async function getPage(debugPort = 9222): Promise<Page> {
  if (page && !page.isClosed()) return page;
  browser = await chromium.connectOverCDP(`http://localhost:${debugPort}`);
  const ctx = browser.contexts()[0] || await browser.newContext();
  const pages = ctx.pages();
  page = pages.find(p => p.url().includes("github.com")) || pages[0] || await ctx.newPage();
  return page;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: "list_projects",
    description: "List all GitHub Projects for a user",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: `GitHub username (default: ${OWNER})` },
        limit: { type: "number", description: "Max projects to return (default: 10)" },
      },
    },
  },
  {
    name: "get_project",
    description: "Get details and fields of a specific project",
    inputSchema: {
      type: "object",
      properties: {
        projectNumber: { type: "number", description: "Project number from GitHub URL" },
        owner: { type: "string", description: `GitHub username (default: ${OWNER})` },
      },
      required: ["projectNumber"],
    },
  },
  {
    name: "list_project_items",
    description: "List all issues/PRs in a project",
    inputSchema: {
      type: "object",
      properties: {
        projectNumber: { type: "number", description: "Project number" },
        owner: { type: "string", description: `GitHub username (default: ${OWNER})` },
        limit: { type: "number", description: "Max items (default: 50)" },
      },
      required: ["projectNumber"],
    },
  },
  {
    name: "create_issue",
    description: "Create a new GitHub issue, optionally add it to a project",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Issue title" },
        body: { type: "string", description: "Issue body" },
        owner: { type: "string", description: `Repo owner (default: ${OWNER})` },
        repo: { type: "string", description: `Repo name (default: ${REPO})` },
        projectNumber: { type: "number", description: "Project to add issue to (optional)" },
        labels: { type: "array", items: { type: "string" }, description: "Labels to apply" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_issue",
    description: "Update an existing GitHub issue",
    inputSchema: {
      type: "object",
      properties: {
        issueNumber: { type: "number", description: "Issue number" },
        title: { type: "string", description: "New title" },
        body: { type: "string", description: "New body" },
        state: { type: "string", enum: ["open", "closed"], description: "Issue state" },
        owner: { type: "string", description: `Repo owner (default: ${OWNER})` },
        repo: { type: "string", description: `Repo name (default: ${REPO})` },
      },
      required: ["issueNumber"],
    },
  },
  {
    name: "add_item_to_project",
    description: "Add an existing issue or PR to a project by its node ID",
    inputSchema: {
      type: "object",
      properties: {
        projectNumber: { type: "number", description: "Project number" },
        contentId: { type: "string", description: "Global node ID of the issue or PR" },
        owner: { type: "string", description: `GitHub username (default: ${OWNER})` },
      },
      required: ["projectNumber", "contentId"],
    },
  },
  {
    name: "create_project_field",
    description: "Add a custom field to a project (text, number, date, or single-select with options)",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project global node ID" },
        name: { type: "string", description: "Field name" },
        dataType: { type: "string", enum: ["TEXT", "NUMBER", "DATE", "SINGLE_SELECT", "ITERATION"], description: "Field type" },
        options: {
          type: "array",
          description: "Options for SINGLE_SELECT fields",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              color: { type: "string", enum: ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE", "PURPLE", "PINK", "GRAY"] },
              description: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      required: ["projectId", "name", "dataType"],
    },
  },
  {
    name: "update_project_item",
    description: "Update a field value on a project item (e.g. Status)",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project global node ID" },
        itemId: { type: "string", description: "Project item global node ID" },
        fieldId: { type: "string", description: "Field global node ID" },
        value: { type: "string", description: "Option ID (single-select) or text value" },
      },
      required: ["projectId", "itemId", "fieldId", "value"],
    },
  },
  {
    name: "browser_navigate",
    description: "Navigate the connected browser to a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
        debugPort: { type: "number", description: "Brave remote debug port (default: 9222)" },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_click",
    description: "Click an element on the current page by text or CSS selector",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or visible text to click" },
        byText: { type: "boolean", description: "If true, match by visible text instead of CSS selector" },
        debugPort: { type: "number", description: "Brave remote debug port (default: 9222)" },
      },
      required: ["selector"],
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current page and return the URL/path",
    inputSchema: {
      type: "object",
      properties: {
        debugPort: { type: "number", description: "Brave remote debug port (default: 9222)" },
      },
    },
  },
  {
    name: "browser_get_page_info",
    description: "Get the current page URL and title",
    inputSchema: {
      type: "object",
      properties: {
        debugPort: { type: "number", description: "Brave remote debug port (default: 9222)" },
      },
    },
  },
  {
    name: "delete_project",
    description: "Permanently delete a GitHub Project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project global node ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "create_repo",
    description: "Create a new GitHub repository for the authenticated user",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Repository name" },
        description: { type: "string", description: "Short description" },
        private: { type: "boolean", description: "Make repo private (default: false)" },
        auto_init: { type: "boolean", description: "Initialize with README (default: false)" },
      },
      required: ["name"],
    },
  },
  {
    name: "search_issues",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "GitHub search query" },
        limit: { type: "number", description: "Max results (default: 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "add_assignees",
    description: "Assign one or more users to an issue",
    inputSchema: {
      type: "object",
      properties: {
        issueNumber: { type: "number", description: "Issue number" },
        assignees: { type: "array", items: { type: "string" }, description: "GitHub usernames to assign" },
        owner: { type: "string", description: `Repo owner (default: ${OWNER})` },
        repo: { type: "string", description: `Repo name (default: ${REPO})` },
      },
      required: ["issueNumber", "assignees"],
    },
  },
  {
    name: "add_issue_comment",
    description: "Post a comment on an issue",
    inputSchema: {
      type: "object",
      properties: {
        issueNumber: { type: "number", description: "Issue number" },
        body: { type: "string", description: "Comment text (supports Markdown)" },
        owner: { type: "string", description: `Repo owner (default: ${OWNER})` },
        repo: { type: "string", description: `Repo name (default: ${REPO})` },
      },
      required: ["issueNumber", "body"],
    },
  },
  {
    name: "create_milestone",
    description: "Create a milestone on a repo to group issues by release or sprint",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Milestone title" },
        description: { type: "string", description: "Milestone description" },
        due_on: { type: "string", description: "Due date in ISO 8601 format (e.g. 2026-03-01T00:00:00Z)" },
        owner: { type: "string", description: `Repo owner (default: ${OWNER})` },
        repo: { type: "string", description: `Repo name (default: ${REPO})` },
      },
      required: ["title"],
    },
  },
  {
    name: "list_milestones",
    description: "List milestones on a repo",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: `Repo owner (default: ${OWNER})` },
        repo: { type: "string", description: `Repo name (default: ${REPO})` },
        state: { type: "string", enum: ["open", "closed", "all"], description: "Filter by state (default: open)" },
      },
    },
  },
  {
    name: "set_issue_milestone",
    description: "Assign a milestone to an issue",
    inputSchema: {
      type: "object",
      properties: {
        issueNumber: { type: "number", description: "Issue number" },
        milestoneNumber: { type: "number", description: "Milestone number" },
        owner: { type: "string", description: `Repo owner (default: ${OWNER})` },
        repo: { type: "string", description: `Repo name (default: ${REPO})` },
      },
      required: ["issueNumber", "milestoneNumber"],
    },
  },
  {
    name: "set_item_date",
    description: "Set a date field value on a project item (used for roadmap start/end dates)",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project global node ID" },
        itemId: { type: "string", description: "Project item global node ID (PVTI_...)" },
        fieldId: { type: "string", description: "Date field global node ID (PVTF_...)" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
      },
      required: ["projectId", "itemId", "fieldId", "date"],
    },
  },
];

// ─── Server setup ────────────────────────────────────────────────────────────

const server = new Server(
  { name: "github-projects-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// ─── Tool handlers ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      case "list_projects": {
        const owner = (args?.owner as string) || OWNER;
        const limit = (args?.limit as number) || 10;

        const result: any = await gql(`
          query($owner: String!, $limit: Int!) {
            user(login: $owner) {
              projectsV2(first: $limit) {
                nodes {
                  id
                  number
                  title
                  shortDescription
                  url
                  public
                  createdAt
                  updatedAt
                }
              }
            }
          }
        `, { owner, limit });

        const projects = result.user?.projectsV2?.nodes ?? [];
        return ok(projects);
      }

      case "get_project": {
        const owner = (args?.owner as string) || OWNER;
        const number = args?.projectNumber as number;

        const result: any = await gql(`
          query($owner: String!, $number: Int!) {
            user(login: $owner) {
              projectV2(number: $number) {
                id
                number
                title
                shortDescription
                url
                public
                readme
                createdAt
                updatedAt
                fields(first: 20) {
                  nodes {
                    ... on ProjectV2Field {
                      id
                      name
                      dataType
                    }
                    ... on ProjectV2SingleSelectField {
                      id
                      name
                      options { id name }
                    }
                  }
                }
              }
            }
          }
        `, { owner, number });

        return ok(result.user?.projectV2);
      }

      case "list_project_items": {
        const owner = (args?.owner as string) || OWNER;
        const number = args?.projectNumber as number;
        const limit = (args?.limit as number) || 50;

        const result: any = await gql(`
          query($owner: String!, $number: Int!, $limit: Int!) {
            user(login: $owner) {
              projectV2(number: $number) {
                items(first: $limit) {
                  nodes {
                    id
                    type
                    content {
                      ... on Issue {
                        id number title state url createdAt updatedAt
                      }
                      ... on PullRequest {
                        id number title state url createdAt updatedAt
                      }
                    }
                    fieldValues(first: 10) {
                      nodes {
                        ... on ProjectV2ItemFieldTextValue {
                          text
                          field { ... on ProjectV2Field { name } }
                        }
                        ... on ProjectV2ItemFieldSingleSelectValue {
                          name
                          field { ... on ProjectV2SingleSelectField { name } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `, { owner, number, limit });

        const items = result.user?.projectV2?.items?.nodes ?? [];
        return ok(items);
      }

      case "create_issue": {
        const owner = (args?.owner as string) || OWNER;
        const repo = (args?.repo as string) || REPO;
        const title = args?.title as string;
        const body = (args?.body as string) || "";

        const repoResult: any = await gql(`
          query($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) { id }
          }
        `, { owner, repo });

        const repositoryId = repoResult.repository.id;

        const created: any = await gql(`
          mutation($repositoryId: ID!, $title: String!, $body: String!) {
            createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body }) {
              issue { id number title url state }
            }
          }
        `, { repositoryId, title, body });

        const issue = created.createIssue.issue;

        if (args?.projectNumber) {
          const projectResult: any = await gql(`
            query($owner: String!, $number: Int!) {
              user(login: $owner) {
                projectV2(number: $number) { id }
              }
            }
          `, { owner, number: args.projectNumber as number });

          const projectId = projectResult.user?.projectV2?.id;
          if (projectId) {
            await gql(`
              mutation($projectId: ID!, $contentId: ID!) {
                addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
                  item { id }
                }
              }
            `, { projectId, contentId: issue.id });
          }
        }

        return ok(issue);
      }

      case "update_issue": {
        const owner = (args?.owner as string) || OWNER;
        const repo = (args?.repo as string) || REPO;
        const issueNumber = args?.issueNumber as number;

        const getResult: any = await gql(`
          query($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
              issue(number: $number) { id }
            }
          }
        `, { owner, repo, number: issueNumber });

        const issueId = getResult.repository.issue.id;
        const patch: any = { issueId };
        if (args?.title) patch.title = args.title;
        if (args?.body) patch.body = args.body;
        if (args?.state) patch.state = (args.state as string).toUpperCase();

        const result: any = await gql(`
          mutation($issueId: ID!, $title: String, $body: String, $state: IssueState) {
            updateIssue(input: { id: $issueId, title: $title, body: $body, state: $state }) {
              issue { id number title state url }
            }
          }
        `, patch);

        return ok(result.updateIssue.issue);
      }

      case "add_item_to_project": {
        const owner = (args?.owner as string) || OWNER;
        const projectNumber = args?.projectNumber as number;
        const contentId = args?.contentId as string;

        const projectResult: any = await gql(`
          query($owner: String!, $number: Int!) {
            user(login: $owner) {
              projectV2(number: $number) { id }
            }
          }
        `, { owner, number: projectNumber });

        const projectId = projectResult.user?.projectV2?.id;
        const result: any = await gql(`
          mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
              item { id }
            }
          }
        `, { projectId, contentId });

        return ok(result.addProjectV2ItemById.item);
      }

      case "create_project_field": {
        const { projectId, name, dataType, options } = args as any;
        const opts = (options || []).map((o: any) => `{ name: ${JSON.stringify(o.name)}, color: ${o.color || "GRAY"}, description: ${JSON.stringify(o.description || "")} }`).join(", ");
        const optionsArg = dataType === "SINGLE_SELECT" && opts ? `, singleSelectOptions: [${opts}]` : "";

        const result: any = await gql(`
          mutation($projectId: ID!, $name: String!, $dataType: ProjectV2CustomFieldType!) {
            createProjectV2Field(input: { projectId: $projectId, name: $name, dataType: $dataType${optionsArg} }) {
              projectV2Field {
                ... on ProjectV2Field { id name dataType }
                ... on ProjectV2SingleSelectField { id name options { id name color } }
              }
            }
          }
        `, { projectId, name, dataType });

        return ok(result.createProjectV2Field.projectV2Field);
      }

      case "update_project_item": {
        const { projectId, itemId, fieldId, value } = args as any;

        const result: any = await gql(`
          mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
            updateProjectV2ItemFieldValue(
              input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value }
            ) {
              projectV2Item { id }
            }
          }
        `, { projectId, itemId, fieldId, value: { singleSelectOptionId: value } });

        return ok(result.updateProjectV2ItemFieldValue.projectV2Item);
      }

      case "search_issues": {
        const searchQuery = args?.query as string;
        const limit = (args?.limit as number) || 20;

        const result: any = await gql(`
          query($searchQuery: String!, $limit: Int!) {
            search(query: $searchQuery, type: ISSUE, first: $limit) {
              nodes {
                ... on Issue {
                  id number title state url createdAt updatedAt
                  author { login }
                  labels(first: 5) { nodes { name } }
                }
                ... on PullRequest {
                  id number title state url createdAt updatedAt
                  author { login }
                }
              }
            }
          }
        `, { searchQuery, limit });

        return ok(result.search.nodes);
      }

      case "browser_navigate": {
        const p = await getPage(args?.debugPort as number || 9222);
        await p.goto(args?.url as string, { waitUntil: "domcontentloaded" });
        return ok({ url: p.url(), title: await p.title() });
      }

      case "browser_click": {
        const p = await getPage(args?.debugPort as number || 9222);
        const sel = args?.selector as string;
        if (args?.byText) {
          await p.getByText(sel, { exact: false }).first().click();
        } else {
          await p.locator(sel).first().click();
        }
        await p.waitForTimeout(800);
        return ok({ clicked: sel, url: p.url() });
      }

      case "browser_screenshot": {
        const p = await getPage(args?.debugPort as number || 9222);
        const path = `E:/Github Projects MCP/screenshot-${Date.now()}.png`;
        await p.screenshot({ path, fullPage: false });
        return ok({ saved: path, url: p.url() });
      }

      case "browser_get_page_info": {
        const p = await getPage(args?.debugPort as number || 9222);
        return ok({ url: p.url(), title: await p.title() });
      }

      case "delete_project": {
        const projectId = args?.projectId as string;
        const result: any = await gql(`
          mutation($projectId: ID!) {
            deleteProjectV2(input: { projectId: $projectId }) {
              projectV2 { id title }
            }
          }
        `, { projectId });
        return ok({ deleted: true, project: result.deleteProjectV2.projectV2 });
      }

      case "create_repo": {
        const repo = await restPost("/user/repos", {
          name: args?.name as string,
          description: (args?.description as string) || "",
          private: (args?.private as boolean) ?? false,
          auto_init: (args?.auto_init as boolean) ?? false,
        });
        return ok({ name: repo.name, full_name: repo.full_name, url: repo.html_url, private: repo.private });
      }

      case "add_assignees": {
        const owner = (args?.owner as string) || OWNER;
        const repo = (args?.repo as string) || REPO;
        const issueNumber = args?.issueNumber as number;
        const assignees = args?.assignees as string[];
        const result = await restPost(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, { assignees });
        return ok({ number: result.number, assignees: result.assignees?.map((a: any) => a.login) });
      }

      case "add_issue_comment": {
        const owner = (args?.owner as string) || OWNER;
        const repo = (args?.repo as string) || REPO;
        const issueNumber = args?.issueNumber as number;
        const body = args?.body as string;
        const result = await restPost(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body });
        return ok({ id: result.id, url: result.html_url, created_at: result.created_at });
      }

      case "create_milestone": {
        const owner = (args?.owner as string) || OWNER;
        const repo = (args?.repo as string) || REPO;
        const payload: any = { title: args?.title as string };
        if (args?.description) payload.description = args.description;
        if (args?.due_on) payload.due_on = args.due_on;
        const result = await restPost(`/repos/${owner}/${repo}/milestones`, payload);
        return ok({ number: result.number, title: result.title, description: result.description, due_on: result.due_on, open_issues: result.open_issues, url: result.html_url });
      }

      case "list_milestones": {
        const owner = (args?.owner as string) || OWNER;
        const repo = (args?.repo as string) || REPO;
        const state = (args?.state as string) || "open";
        const result = await restGet(`/repos/${owner}/${repo}/milestones?state=${state}&per_page=30`);
        return ok(result.map((m: any) => ({ number: m.number, title: m.title, description: m.description, due_on: m.due_on, open_issues: m.open_issues, closed_issues: m.closed_issues, state: m.state, url: m.html_url })));
      }

      case "set_issue_milestone": {
        const owner = (args?.owner as string) || OWNER;
        const repo = (args?.repo as string) || REPO;
        const issueNumber = args?.issueNumber as number;
        const milestoneNumber = args?.milestoneNumber as number;
        const result = await restPatch(`/repos/${owner}/${repo}/issues/${issueNumber}`, { milestone: milestoneNumber });
        return ok({ number: result.number, title: result.title, milestone: result.milestone ? { number: result.milestone.number, title: result.milestone.title } : null });
      }

      case "set_item_date": {
        const projectId = args?.projectId as string;
        const itemId = args?.itemId as string;
        const fieldId = args?.fieldId as string;
        const date = args?.date as string;
        await gql(`
          mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $date: Date!) {
            updateProjectV2ItemFieldValue(input: {
              projectId: $projectId
              itemId: $itemId
              fieldId: $fieldId
              value: { date: $date }
            }) { projectV2Item { id } }
          }
        `, { projectId, itemId, fieldId, date });
        return ok({ set: true, itemId, fieldId, date });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

function ok(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("GitHub Projects MCP v2 running on stdio");
