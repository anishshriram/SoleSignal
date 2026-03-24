// Extends Express Request to include the authenticated user payload from JWT
declare namespace Express {
  interface Request {
    user?: {
      user_id: number;
      email: string;
      iat: number;
      exp: number;
    };
  }
}
