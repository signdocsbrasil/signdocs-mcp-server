import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TransactionListParams, TransactionStatus } from '@signdocs-brasil/api';
import type { ToolContext } from '../client.js';
import { CONFIRM_WARNING, DESTRUCTIVE, READ_ONLY } from '../annotations.js';
import { run } from './helpers.js';
import { listTransactionsShape, transactionIdShape } from '../schemas.js';

export function registerTransactionTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_transactions',
    {
      title: 'List / find transactions',
      description:
        'Search transactions by status, signer external ID, document group, or date range (cursor pagination). ' +
        'Use this to find a transaction or check signing history.',
      inputSchema: listTransactionsShape,
      annotations: READ_ONLY,
    },
    async (args) => {
      const params: TransactionListParams = {
        ...(args.status ? { status: args.status as TransactionStatus } : {}),
        ...(args.userExternalId ? { userExternalId: args.userExternalId } : {}),
        ...(args.documentGroupId ? { documentGroupId: args.documentGroupId } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        ...(args.nextToken ? { nextToken: args.nextToken } : {}),
        ...(args.startDate ? { startDate: args.startDate } : {}),
        ...(args.endDate ? { endDate: args.endDate } : {}),
      };
      return run(() => ctx.client.transactions.list(params));
    },
  );

  server.registerTool(
    'get_transaction',
    {
      title: 'Get transaction',
      description: 'Get full details of a single transaction, including its steps and results.',
      inputSchema: transactionIdShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => ctx.client.transactions.get(args.transactionId)),
  );

  server.registerTool(
    'cancel_transaction',
    {
      title: 'Cancel transaction',
      description: CONFIRM_WARNING + 'Cancel a low-level transaction. This cannot be undone.',
      inputSchema: transactionIdShape,
      annotations: DESTRUCTIVE,
    },
    async (args) => run(() => ctx.client.transactions.cancel(args.transactionId)),
  );
}
