import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  SaveMemoryParams,
  GetMemoriesParams,
  SearchMemoriesParams,
  DeleteMemoryParams,
  SupersedeMemoryParams,
  UpdateMemoryParams,
} from '@cortex/shared';
import { CreateMemorySchema, formatAge } from '@cortex/shared';
import { MemoryRepository } from '../db/repositories/memory.repo.js';
import { ProjectRepository } from '../db/repositories/project.repo.js';
import { SessionRepository } from '../db/repositories/session.repo.js';
import { runQualityGate } from '../quality/gate.js';
import { recordToolCall } from '../quality/rules/rate-limit.js';
import { detectProject } from '../detection/detector.js';
import { buildContextBlock } from '../context/builder.js';

/**
 * MCP Tool definitions for the Cortex memory server.
 */
const TOOLS = [
  {
    name: 'save_memory',
    description:
      'Save a structured memory to Cortex. Use this when you identify a decision, preference, open thread, error, learning, or important context worth remembering across sessions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'The memory content (50-2000 chars). Be specific — names, versions, rationale.',
        },
        type: {
          type: 'string',
          enum: ['decision', 'context', 'preference', 'thread', 'error', 'learning'],
          description: 'Memory type: decision (architectural/tech choices), context (project state), preference (working prefs), thread (open problems), error (bugs/gotchas), learning (facts learned).',
        },
        reason: {
          type: 'string',
          description: 'Why this memory matters (min 10 chars). Justify the save.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional topic tags for retrieval.',
        },
        importance: {
          type: 'number',
          description: 'Importance score 1-10 (default 5). Higher = more likely to surface.',
        },
        confidence: {
          type: 'number',
          description: 'Confidence score 1-5 (default 3). Low confidence shown as UNCERTAIN.',
        },
      },
      required: ['content', 'type', 'reason'],
    },
  },
  {
    name: 'get_memories',
    description:
      'Retrieve project memories and inject context. Called at session start to build awareness. Returns a structured context block with decisions, preferences, open threads, and recent changes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['decision', 'context', 'preference', 'thread', 'error', 'learning'],
          description: 'Optional: filter by memory type.',
        },
        limit: {
          type: 'number',
          description: 'Max memories to return (default 20).',
        },
        min_importance: {
          type: 'number',
          description: 'Only return memories above this importance score.',
        },
      },
    },
  },
  {
    name: 'search_memories',
    description:
      'Full-text search across memories for the current project. Use when you need specific context during a session.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query.' },
        type: {
          type: 'string',
          enum: ['decision', 'context', 'preference', 'thread', 'error', 'learning'],
          description: 'Optional type filter.',
        },
        limit: { type: 'number', description: 'Max results (default 10).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_projects',
    description: 'List all projects Cortex has memory for, with memory counts.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'delete_memory',
    description: 'Delete a specific memory by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        memory_id: { type: 'string', description: 'UUID of the memory to delete.' },
      },
      required: ['memory_id'],
    },
  },
  {
    name: 'supersede_memory',
    description:
      'Replace an existing memory with updated content. The old memory is marked as superseded and a new one is created.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        memory_id: { type: 'string', description: 'UUID of the memory to supersede.' },
        content: { type: 'string', description: 'New content (50-2000 chars).' },
        reason: { type: 'string', description: 'Why this memory is being updated.' },
        tags: { type: 'array', items: { type: 'string' } },
        importance: { type: 'number' },
        confidence: { type: 'number' },
      },
      required: ['memory_id', 'content', 'reason'],
    },
  },
  {
    name: 'update_memory',
    description: 'Update metadata of an existing memory (type, importance, confidence, tags, expiry). Content changes require supersede.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        memory_id: { type: 'string', description: 'UUID of the memory to update.' },
        type: { type: 'string', enum: ['decision', 'context', 'preference', 'thread', 'error', 'learning'] },
        importance: { type: 'number' },
        confidence: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
        expires_at: { type: 'string', description: 'ISO datetime or null to remove expiry.' },
      },
      required: ['memory_id'],
    },
  },
];

/**
 * Create and start the Cortex MCP server.
 */
export async function createMCPServer(
  db: Database.Database,
  cwd: string,
  machineId?: string,
): Promise<Server> {
  const server = new Server(
    { name: 'cortex', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  const memRepo = new MemoryRepository(db);
  const projectRepo = new ProjectRepository(db);
  const sessionRepo = new SessionRepository(db);

  // Detect project from working directory
  const detection = detectProject(cwd, db);
  const projectId = detection.project_id;

  // Create a session for this MCP connection
  const session = sessionRepo.create(projectId, machineId);

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'save_memory': {
          const params = args as unknown as SaveMemoryParams;
          const input = {
            content: params.content,
            type: params.type,
            reason: params.reason,
            tags: params.tags,
            importance: params.importance,
            confidence: params.confidence,
          };

          // Run quality gate
          const gateResult = runQualityGate(input, db, projectId, session.id);
          if (!gateResult.passed) {
            // Record the attempt for rate limiting
            recordToolCall(db, uuid(), 'save_memory', session.id, projectId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: gateResult.error_code,
                    message: gateResult.error_message,
                  }),
                },
              ],
              isError: true,
            };
          }

          // Save memory
          const memory = memRepo.create(input, projectId, session.id, machineId);
          sessionRepo.incrementMemoryCount(session.id);
          recordToolCall(db, uuid(), 'save_memory', session.id, projectId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  memory_id: memory.id,
                  project_id: projectId,
                  type: memory.type,
                  importance: memory.importance,
                  message: `Memory saved: [${memory.type}] importance ${memory.importance}/10`,
                }),
              },
            ],
          };
        }

        case 'get_memories': {
          const params = args as unknown as GetMemoriesParams;
          const { contextBlock, memoryCount, tokenCount } = buildContextBlock(
            db,
            projectId,
            params.limit ? params.limit * 200 : undefined, // Rough estimate
          );

          return {
            content: [
              {
                type: 'text',
                text: contextBlock || `No memories found for project "${detection.project_name}".`,
              },
            ],
          };
        }

        case 'search_memories': {
          const params = args as unknown as SearchMemoriesParams;
          const results = memRepo.search(params.query, projectId, params.limit || 10);

          if (results.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No memories found matching "${params.query}" in project "${detection.project_name}".`,
                },
              ],
            };
          }

          const formatted = results
            .map(
              (m, i) =>
                `${i + 1}. [${m.type}] (importance: ${m.importance}) ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}\n   ID: ${m.id}`,
            )
            .join('\n\n');

          return {
            content: [
              {
                type: 'text',
                text: `Found ${results.length} memories matching "${params.query}":\n\n${formatted}`,
              },
            ],
          };
        }

        case 'list_projects': {
          const projects = projectRepo.listAll();
          const formatted = projects
            .map((p) => {
              const count = memRepo.countByProject(p.id);
              return `· ${p.name} (${count} memories) — last session: ${formatAge(p.last_session_at)}`;
            })
            .join('\n');

          return {
            content: [
              {
                type: 'text',
                text: `${projects.length} projects:\n\n${formatted}`,
              },
            ],
          };
        }

        case 'delete_memory': {
          const params = args as unknown as DeleteMemoryParams;
          const deleted = memRepo.softDelete(params.memory_id);

          return {
            content: [
              {
                type: 'text',
                text: deleted
                  ? `Memory ${params.memory_id} deleted.`
                  : `Memory ${params.memory_id} not found.`,
              },
            ],
            isError: !deleted,
          };
        }

        case 'supersede_memory': {
          const params = args as unknown as SupersedeMemoryParams;
          const input = {
            content: params.content,
            type: memRepo.getById(params.memory_id)?.type || 'decision',
            reason: params.reason,
            tags: params.tags,
            importance: params.importance,
            confidence: params.confidence,
          };

          // Quality gate on new content
          const gateResult = runQualityGate(input, db, projectId, session.id);
          if (!gateResult.passed) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: gateResult.error_code,
                    message: gateResult.error_message,
                  }),
                },
              ],
              isError: true,
            };
          }

          const result = memRepo.supersede(
            params.memory_id,
            input,
            projectId,
            session.id,
            machineId,
          );

          if (!result) {
            return {
              content: [
                { type: 'text', text: `Memory ${params.memory_id} not found.` },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  old_memory_id: result.old.id,
                  new_memory_id: result.new.id,
                  message: `Memory superseded. Old: ${result.old.id}, New: ${result.new.id}`,
                }),
              },
            ],
          };
        }

        case 'update_memory': {
          const params = args as unknown as UpdateMemoryParams;
          const updated = memRepo.update(params.memory_id, {
            type: params.type,
            importance: params.importance,
            confidence: params.confidence,
            tags: params.tags,
            expires_at: params.expires_at,
          });

          if (!updated) {
            return {
              content: [
                { type: 'text', text: `Memory ${params.memory_id} not found.` },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  memory_id: updated.id,
                  updated_fields: Object.keys(params).filter((k) => k !== 'memory_id'),
                  message: 'Memory metadata updated.',
                }),
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start the MCP server with stdio transport.
 */
export async function startMCPServer(
  db: Database.Database,
  cwd: string,
  machineId?: string,
): Promise<void> {
  const server = await createMCPServer(db, cwd, machineId);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

