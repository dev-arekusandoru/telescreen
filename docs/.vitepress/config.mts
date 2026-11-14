import { defineConfig } from 'vitepress';

const sidebar = [
  { text: 'Documentation', link: '/' },
  {
    text: 'Start',
    collapsed: false,
    items: [
      { text: 'Overview', link: '/start/overview' },
      { text: 'Install', link: '/start/install' },
      { text: 'First run', link: '/start/first-run' },
    ],
  },
  {
    text: 'Use Telescreen',
    items: [
      { text: 'Calendar', link: '/use/calendar' },
      { text: 'Events', link: '/use/events' },
      { text: 'Chores', link: '/use/chores' },
      { text: 'Meals', link: '/use/meals' },
      { text: 'Music', link: '/use/music' },
      { text: 'Weather', link: '/use/weather' },
      { text: 'Travel', link: '/use/travel' },
      { text: 'Settings', link: '/use/settings' },
    ],
  },
  {
    text: 'Connect',
    items: [
      { text: 'Google Calendar', link: '/connect/google' },
      { text: 'iCloud', link: '/connect/icloud' },
      { text: 'Spotify', link: '/connect/spotify' },
      { text: 'PantryPal', link: '/connect/pantrypal' },
    ],
  },
  {
    text: 'Host Telescreen',
    items: [
      { text: 'Configuration', link: '/host/configuration' },
      { text: 'Deployment', link: '/host/deployment' },
      { text: 'Security', link: '/host/security' },
      { text: 'Backups', link: '/host/backups' },
      { text: 'Updates', link: '/host/updates' },
      { text: 'Troubleshooting', link: '/host/troubleshooting' },
    ],
  },
  {
    text: 'Develop and contribute',
    items: [
      { text: 'Local setup', link: '/develop/setup' },
      { text: 'Tests and checks', link: '/develop/checks' },
      { text: 'Architecture', link: '/develop/architecture' },
      { text: 'Contribute', link: '/develop/contributing' },
      { text: 'Documentation site', link: '/develop/documentation' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'REST API', link: '/reference/rest-api' },
      { text: 'CLI commands', link: '/reference/cli' },
      { text: 'Environment variables', link: '/reference/environment' },
    ],
  },
];

export default defineConfig({
  lang: 'en',
  title: 'Telescreen',
  description: 'Self-hosted family wall calendar, chores, and widgets.',
  base: '/telescreen/',
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', href: '/telescreen/icon-192.png' }],
    ['meta', { name: 'theme-color', content: '#a84c2a' }],
  ],
  themeConfig: {
    logo: '/icon-192.png',
    siteTitle: 'Telescreen',
    nav: [
      { text: 'Guide', link: '/', activeMatch: '^/(start|use|connect|host)/' },
      { text: 'Install', link: '/start/install' },
      { text: 'Develop', link: '/develop/setup' },
    ],
    sidebar,
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/dev-arekusandoru/telescreen' }],
    editLink: {
      pattern: 'https://github.com/dev-arekusandoru/telescreen/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'MIT licensed',
      copyright: 'Telescreen contributors',
    },
    outline: { level: [2, 3] },
  },
});
