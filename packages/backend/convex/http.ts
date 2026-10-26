import { httpRouter } from 'convex/server';
import { auth } from './auth';

// Serves the public keys the tokens are checked with.
const http = httpRouter();
auth.addHttpRoutes(http);
export default http;
