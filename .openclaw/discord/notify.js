#!/usr/bin/env node
// ============================================================
// Discord Notifier — GitHub Actions → Discord
// Usage : node discord-notify.js <type> [options]
// ============================================================
// Types : ci-start | ci-success | ci-failure | release | sentry
// ============================================================

const https = require('https');

const CHANNELS = {
  'ci-status':    process.env.CHAN_CI_STATUS,
  'tests':        process.env.CHAN_TESTS,
  'releases':     process.env.CHAN_RELEASES,
  'dev-feed':     process.env.CHAN_DEV_FEED,
  'agent-logs':   process.env.CHAN_AGENT_LOGS,
  'pr':           process.env.CHAN_PULL_REQUESTS,
  'security':     process.env.CHAN_SECURITY,
  'infra':        process.env.CHAN_INFRA,
};

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

async function sendMessage(channelId, content, embeds = []) {
  const body = JSON.stringify({ content, embeds });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'discord.com',
      path: `/api/v10/channels/${channelId}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Length': Buffer.byteLength(body),
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const TEMPLATES = {
  'ci-start': () => ({
    channel: 'ci-status',
    content: null,
    embeds: [{
      color: 0xF4B942,  // Jaune
      title: `🔄 CI démarré — ${process.env.GITHUB_WORKFLOW}`,
      fields: [
        { name: 'Branch', value: process.env.GITHUB_REF_NAME, inline: true },
        { name: 'Commit', value: `[\`${process.env.GITHUB_SHA?.slice(0,7)}\`](https://github.com/${process.env.GITHUB_REPOSITORY}/commit/${process.env.GITHUB_SHA})`, inline: true },
        { name: 'Déclenché par', value: process.env.GITHUB_ACTOR, inline: true },
      ],
      timestamp: new Date().toISOString(),
    }]
  }),

  'ci-success': () => ({
    channel: 'ci-status',
    content: null,
    embeds: [{
      color: 0x00D084,  // Vert
      title: `✅ CI réussi — ${process.env.GITHUB_WORKFLOW}`,
      fields: [
        { name: 'Branch', value: process.env.GITHUB_REF_NAME, inline: true },
        { name: 'Durée', value: process.env.CI_DURATION || 'N/A', inline: true },
        { name: 'Coverage', value: `${process.env.CI_COVERAGE || '?'}%`, inline: true },
      ],
      url: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      timestamp: new Date().toISOString(),
    }]
  }),

  'ci-failure': () => ({
    channel: 'ci-status',
    content: `<@${process.env.DISCORD_DEV_ID}> CI en échec !`,
    embeds: [{
      color: 0xFF4757,  // Rouge
      title: `❌ CI échoué — ${process.env.GITHUB_WORKFLOW}`,
      fields: [
        { name: 'Branch', value: process.env.GITHUB_REF_NAME, inline: true },
        { name: 'Étape', value: process.env.FAILED_STEP || 'Unknown', inline: true },
        { name: 'Logs', value: `[Voir les logs](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID})`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    }]
  }),

  'pr-opened': () => ({
    channel: 'pr',
    content: null,
    embeds: [{
      color: 0x6C63FF,  // Violet Koklo
      title: `🔀 PR #${process.env.PR_NUMBER} — ${process.env.PR_TITLE}`,
      description: process.env.PR_BODY?.slice(0, 300),
      fields: [
        { name: 'Auteur', value: process.env.PR_AUTHOR, inline: true },
        { name: 'Branch', value: `\`${process.env.PR_BRANCH}\` → \`main\``, inline: true },
      ],
      url: process.env.PR_URL,
      timestamp: new Date().toISOString(),
    }]
  }),

  'release': () => ({
    channel: 'releases',
    content: null,
    embeds: [{
      color: 0x00D084,
      title: `🎉 Koklo ${process.env.RELEASE_VERSION} publié !`,
      description: process.env.RELEASE_NOTES?.slice(0, 500),
      fields: [
        { name: 'Release', value: `[${process.env.RELEASE_VERSION}](${process.env.RELEASE_URL})`, inline: true },
        { name: 'Docs', value: '[docs.ops.koklo.dev](https://docs.ops.koklo.dev)', inline: true },
      ],
      timestamp: new Date().toISOString(),
    }]
  }),

  'sentry-alert': () => ({
    channel: 'security',
    content: `<@${process.env.DISCORD_DEV_ID}> Nouvelle erreur Sentry`,
    embeds: [{
      color: 0xFF4757,
      title: `🚨 ${process.env.SENTRY_TITLE}`,
      description: process.env.SENTRY_MESSAGE?.slice(0, 300),
      fields: [
        { name: 'Sévérité', value: process.env.SENTRY_LEVEL, inline: true },
        { name: 'Environnement', value: process.env.SENTRY_ENVIRONMENT, inline: true },
        { name: 'Lien', value: `[Voir dans Sentry](${process.env.SENTRY_URL})`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    }]
  }),
};

async function main() {
  const type = process.argv[2];
  if (!type || !TEMPLATES[type]) {
    console.error(`Type inconnu: ${type}`);
    console.error(`Types disponibles: ${Object.keys(TEMPLATES).join(', ')}`);
    process.exit(1);
  }

  const template = TEMPLATES[type]();
  const channelId = CHANNELS[template.channel];

  if (!channelId) {
    console.error(`Channel ID manquant pour: ${template.channel}`);
    process.exit(1);
  }

  try {
    const result = await sendMessage(channelId, template.content, template.embeds);
    console.log(`✅ Message envoyé dans #${template.channel} (ID: ${result.id})`);
  } catch (err) {
    console.error('❌ Erreur envoi Discord:', err);
    process.exit(1);
  }
}

main();
