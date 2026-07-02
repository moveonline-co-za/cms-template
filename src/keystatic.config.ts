import { config, fields, collection } from '@keystatic/core';

// Dynamically target the testing branch during automated test flights.
// Safely handle both import.meta.env (Astro/Vite) and process.env (Node.js/shims) 
// to prevent ReferenceError in browser hydration and TypeError in Node.js execution.
const isLocal = typeof import.meta.env !== 'undefined'
  ? import.meta.env.DEV
  : (typeof process !== 'undefined' && process.env.NODE_ENV === 'development');

const branch = (typeof import.meta.env !== 'undefined' ? import.meta.env.KEYSTATIC_TARGET_BRANCH : undefined)
  || (typeof process !== 'undefined' && process.env.KEYSTATIC_TARGET_BRANCH)
  || 'main';

export default config({
  storage: isLocal
    ? { kind: 'local' }
    : {
        kind: 'github',
        repo: 'moveonline-co-za/cms-template',
        branch: branch,
      },
  collections: {
    posts: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'src/content/posts/*',
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
      },
    }),
  },
});
