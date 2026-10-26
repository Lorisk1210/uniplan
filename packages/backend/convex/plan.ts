import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const KEY = /^(program|semester:[^\s]{1,100}|course:[^\s]{1,100})$/;
const MAX_VALUE = 200_000;
const MAX_BATCH = 200;

/** The signed-in account's plan as key/value items, or null when signed out. */
export const items = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const rows = await ctx.db.query('items').withIndex('by_user_key', (q) => q.eq('userId', userId)).collect();
    return rows.map((r) => ({ key: r.key, value: r.value }));
  },
});

/** Writes and deletes items. The last write to an item wins. */
export const push = mutation({
  args: {
    put: v.array(v.object({ key: v.string(), value: v.string() })),
    remove: v.array(v.string()),
  },
  handler: async (ctx, { put, remove }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not signed in');
    if (put.length + remove.length > MAX_BATCH) throw new Error('Too many changes at once');
    const find = (key: string) => ctx.db.query('items').withIndex('by_user_key', (q) => q.eq('userId', userId).eq('key', key)).unique();
    for (const { key, value } of put) {
      if (!KEY.test(key) || value.length > MAX_VALUE) throw new Error(`Invalid item ${key.slice(0, 120)}`);
      const row = await find(key);
      if (!row) await ctx.db.insert('items', { userId, key, value });
      else if (row.value !== value) await ctx.db.patch(row._id, { value });
    }
    for (const key of remove) {
      const row = await find(key);
      if (row) await ctx.db.delete(row._id);
    }
  },
});

