import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';

// Email and password, at least 8 characters. Anyone can create an account; each account only sees its own plan.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
