// @ts-check
import { defineConfig } from 'astro/config';
import amplify from 'astro-aws-amplify';
import markdoc from '@astrojs/markdoc';

// https://astro.build/config
//
// The adapter below (astro-aws-amplify) is what the reference deployment
// uses. Any Astro SSR adapter works equally well here (@astrojs/node,
// @astrojs/netlify, @astrojs/vercel, ...) — swap it out and remove the
// patches/ directory + postinstall script if you do.
export default defineConfig({
  site: 'https://mysite.com', // update to match ARCHIVE_CONFIG.siteUrl
  output: 'server',
  adapter: amplify(),
  security: {
    checkOrigin: false,
  },
  integrations: [
    markdoc(),
  ],
  vite: {
    // Vite/esbuild only treats known web-asset extensions as binary assets.
    // Add every retro file extension you plan to serve so Astro emits a
    // CDN URL via import.meta.glob(..., { as: 'url' }) instead of trying
    // to parse the file as source code.
    assetsInclude: [
      '**/*.prg', '**/*.p00',
      '**/*.seq', '**/*.s00',
      '**/*.usr', '**/*.u00',
      '**/*.rel', '**/*.r00',
      '**/*.d64', '**/*.d71', '**/*.d80', '**/*.d81', '**/*.d82',
      '**/*.d90', '**/*.dnp', '**/*.g41', '**/*.g64', '**/*.g71',
      '**/*.t64', '**/*.tap', '**/*.htap',
      '**/*.crt', '**/*.tcrt',
      '**/*.bas', '**/*.bin', '**/*.rom',
      '**/*.sid',
    ],
    ssr: {
      // Packages here must have an ESM "import" export condition. See
      // docs/configuration.md for why this list exists and how to extend it.
      noExternal: [
        '@markdoc/markdoc',
        'github-slugger',
      ],
    },
  },
});
