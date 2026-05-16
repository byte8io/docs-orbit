import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: [
        'getting-started/quick-start',
        'getting-started/installation',
        'getting-started/first-deployment',
      ],
    },
    {
      type: 'category',
      label: 'The agent',
      items: [
        'agent/install',
        'agent/init',
        'agent/systemd',
        'agent/self-upgrade',
        'agent/logs',
      ],
    },
    {
      type: 'category',
      label: 'Environments',
      items: [
        'environments/overview',
        'environments/shared-dirs',
        'environments/agent-tokens',
        'environments/health-checks',
      ],
    },
    {
      type: 'category',
      label: 'Deployments',
      items: [
        'deployments/deploy-types',
        'deployments/triggering',
        'deployments/rollback',
      ],
    },
    {
      type: 'category',
      label: 'Zero-downtime',
      items: [
        'zero-downtime/overview',
        'zero-downtime/maintenance-window',
        'zero-downtime/allowlist-ips',
        'zero-downtime/drift-detection',
        'zero-downtime/config-import',
      ],
    },
    {
      type: 'category',
      label: 'API',
      items: [
        'api/graphql',
        'api/personal-access-tokens',
      ],
    },
    'troubleshooting',
  ],
};

export default sidebars;
