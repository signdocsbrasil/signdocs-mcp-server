import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebhookEventType } from '@signdocs-brasil/api';
import { getClient } from '../client.js';
import { CONFIRM_WARNING, DESTRUCTIVE, READ_ONLY, WRITE_SAFE } from '../annotations.js';
import { run } from './helpers.js';
import { registerWebhookShape, webhookIdShape } from '../schemas.js';

export function registerWebhookTools(server: McpServer): void {
  server.registerTool(
    'register_webhook',
    {
      title: 'Register webhook',
      description:
        'Register an HTTPS endpoint to receive event notifications. The response returns a signing secret ' +
        '— store it to verify the HMAC-SHA256 signature on incoming payloads.',
      inputSchema: registerWebhookShape,
      annotations: WRITE_SAFE,
    },
    async (args) =>
      run(() =>
        getClient().webhooks.register({ url: args.url, events: args.events as WebhookEventType[] }),
      ),
  );

  server.registerTool(
    'list_webhooks',
    {
      title: 'List webhooks',
      description: 'List all registered webhooks for the tenant.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => run(() => getClient().webhooks.list()),
  );

  server.registerTool(
    'delete_webhook',
    {
      title: 'Delete webhook',
      description: CONFIRM_WARNING + 'Delete a registered webhook. Event delivery to it stops immediately.',
      inputSchema: webhookIdShape,
      annotations: DESTRUCTIVE,
    },
    async (args) =>
      run(async () => {
        await getClient().webhooks.delete(args.webhookId);
        return { webhookId: args.webhookId, deleted: true };
      }),
  );

  server.registerTool(
    'test_webhook',
    {
      title: 'Test webhook',
      description: 'Send a sample payload to a registered webhook and return the delivery result.',
      inputSchema: webhookIdShape,
      annotations: WRITE_SAFE,
    },
    async (args) => run(() => getClient().webhooks.test(args.webhookId)),
  );
}
