import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getClient } from '../client.js';
import { READ_ONLY } from '../annotations.js';
import { run } from './helpers.js';
import { transactionIdShape } from '../schemas.js';

export function registerEvidenceTools(server: McpServer): void {
  server.registerTool(
    'get_evidence',
    {
      title: 'Get evidence',
      description:
        'Retrieve the cryptographic evidence (hashes, step proofs, evidenceId) for a completed transaction.',
      inputSchema: transactionIdShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => getClient().evidence.get(args.transactionId)),
  );
}
