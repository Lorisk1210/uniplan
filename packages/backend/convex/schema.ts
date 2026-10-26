import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,
  // A plan, split into one row per synced item: "program", "semester:<id>" and "course:<id>".
  // The value is the item's JSON as the apps write it, so the apps own the data model.
  items: defineTable({
    userId: v.id('users'),
    key: v.string(),
    value: v.string(),
  }).index('by_user_key', ['userId', 'key']),
});
