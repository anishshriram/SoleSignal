// express.d.ts — TypeScript declaration file that extends the Express Request type.
//
// By default, Express's Request type has no `user` property. The auth middleware
// (middleware/auth.ts) decodes the JWT and attaches the payload to req.user.
// Without this declaration, TypeScript would throw a type error every time a
// controller accesses req.user.user_id.
//
// This file tells TypeScript: "trust that req.user exists and has this shape."

declare namespace Express {
  interface Request {
    user?: {
      user_id: number; // The authenticated user's database ID — used to scope all queries
      email: string;   // The authenticated user's email — included in JWT payload
      iat: number;     // "Issued at" timestamp (Unix seconds) — set automatically by jsonwebtoken
      exp: number;     // "Expires at" timestamp (Unix seconds) — 24 hours after iat
    };
  }
}
