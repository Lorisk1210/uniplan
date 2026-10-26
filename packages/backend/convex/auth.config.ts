// Convex checks the tokens Convex Auth signs (see auth.ts) against this deployment's own keys.
export default {
  providers: [{ domain: process.env.CONVEX_SITE_URL, applicationID: 'convex' }],
};
