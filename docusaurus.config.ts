import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Byte8 Orbit',
  tagline:
    'Zero-downtime Magento 2 deployments. Atomic releases, automatic rollback, no maintenance window for code-only deploys.',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  // Production URL — served under unified docs domain (Cloudflare Pages + Worker router).
  // See apps/docs-router in the byte8.io monorepo + docs/DOCS_SITE_MIGRATION.md.
  url: 'https://docs.byte8.io',
  baseUrl: '/orbit/',
  trailingSlash: false,

  onBrokenLinks: 'warn',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl:
            'https://github.com/byte8io/docs.orbit.byte8.io/edit/main/',
        },
        blog: {
          showReadingTime: true,
          blogTitle: 'Changelog & updates',
          blogDescription: 'Release notes for Byte8 Orbit',
          postsPerPage: 10,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl:
            'https://github.com/byte8io/docs.orbit.byte8.io/edit/main/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Byte8 Orbit',
      logo: {
        alt: 'Byte8 Orbit',
        src: 'img/logo.svg',
        srcDark: 'img/logo.svg',
        width: 32,
        height: 32,
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        { to: '/blog', label: 'Changelog', position: 'left' },
        {
          href: 'https://byte8.io/products/orbit#pricing',
          label: 'Pricing',
          position: 'left',
        },
        {
          href: 'https://github.com/byte8io/orbit-agent',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'orbit-agent GitHub repository',
        },
        {
          href: 'https://orbit.byte8.io',
          label: 'Dashboard',
          position: 'right',
          className: 'navbar-cta-button',
        },
      ],
    },
    footer: {
      style: 'dark',
      logo: {
        alt: 'Byte8',
        src: 'img/logo.svg',
        href: 'https://byte8.io',
        width: 32,
        height: 32,
      },
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Quick start', to: '/docs/getting-started/quick-start' },
            { label: 'Install the agent', to: '/docs/agent/install' },
            { label: 'Zero-downtime', to: '/docs/zero-downtime/overview' },
            { label: 'Troubleshooting', to: '/docs/troubleshooting' },
          ],
        },
        {
          title: 'Resources',
          items: [
            { label: 'Changelog', to: '/blog' },
            { label: 'Dashboard', href: 'https://orbit.byte8.io' },
            { label: 'Pricing', href: 'https://byte8.io/products/orbit#pricing' },
            { label: 'orbit-agent on GitHub', href: 'https://github.com/byte8io/orbit-agent' },
          ],
        },
        {
          title: 'Byte8',
          items: [
            { label: 'byte8.io', href: 'https://byte8.io' },
            { label: 'Orbit product', href: 'https://byte8.io/products/orbit' },
            { label: 'Pulsar (monitoring)', href: 'https://docs.byte8.io/pulsar/' },
            { label: 'Contact', href: 'mailto:helo@byte8.io' },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Byte8 Ltd.`,
    },
    prism: {
      theme: prismThemes.vsDark,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'json', 'yaml', 'toml', 'nginx', 'rust', 'php', 'graphql', 'diff'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
