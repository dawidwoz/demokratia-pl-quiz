/** The signed-in account as the API returns it (never includes anything secret). */
export interface AuthUser {
  id: number;
  email: string;
}

/** Body of `GET /auth/me` and `POST /auth/login`: `user` is null for an anonymous visitor. */
export interface MeResponse {
  user: AuthUser | null;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface StatusResponse {
  status: 'ok';
}

export interface RegisterRequest {
  email: string;
  password: string;
  acceptTerms: boolean;
}
