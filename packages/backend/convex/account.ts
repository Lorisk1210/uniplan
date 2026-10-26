import { ConvexError, v } from 'convex/values';
import { api } from './_generated/api';
import { action } from './_generated/server';

/** What the apps get when signing in fails. */
const CODES = ['InvalidAccountId', 'InvalidSecret', 'TooManyFailedAttempts', 'Invalid password', 'already exists'] as const;

/**
 * Signs in or creates an account with email and password, and returns the tokens.
 * Production deployments hide error messages from the apps unless they're ConvexErrors, and Convex
 * Auth throws plain errors, so this passes its errors on as one of CODES.
 */
export const signIn = action({
  args: { email: v.string(), password: v.string(), flow: v.union(v.literal('signIn'), v.literal('signUp')) },
  handler: async (ctx, { email, password, flow }): Promise<{ token: string; refreshToken: string } | null> => {
    try {
      const r = await ctx.runAction(api.auth.signIn, { provider: 'password', params: { email, password, flow } });
      return r.tokens ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ConvexError(CODES.find((c) => msg.includes(c)) ?? 'Failed');
    }
  },
});
