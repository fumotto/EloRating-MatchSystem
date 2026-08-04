import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

export interface JwtClaims {
  sub: string;
  app_metadata?: {
    provider?: string;
    role?: string;
  };
}

let jwtVerifier = (token: string) => verify(token, "SECRET_KEY");

export async function verifyJwt(req: Request): Promise<JwtClaims | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    return await jwtVerifier(token);
  } catch (e) {
    return null;
  }
}

export function setJwtVerifier(verify: (token: string) => Promise<JwtClaims | null>) {
  jwtVerifier = verify;
}

export function resetJwtVerifier() {
  jwtVerifier = (token: string) => verify(token, "SECRET_KEY");
}