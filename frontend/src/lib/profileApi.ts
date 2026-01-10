import type { JsonRpcSigner } from "ethers";

export type UserProfile = {
  walletAddress: string;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  updatedAt?: string | null;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (!API_BASE) throw new Error("Profile API is not configured (VITE_API_BASE_URL is missing).");
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readJsonOrText(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function toUserProfile(body: any, fallbackWallet: string): UserProfile {
  return {
    walletAddress: body.walletAddress ?? body.wallet_address ?? fallbackWallet,
    username: body.username ?? null,
    bio: body.bio ?? null,
    avatarUrl: body.avatarUrl ?? body.avatar_url ?? null,
    updatedAt: body.updatedAt ?? body.updated_at ?? null,
  };
}

export async function fetchUserProfile(walletAddress: string): Promise<UserProfile | null> {
  if (!API_BASE) return null; // allow app to run without backend configured
  const res = await fetch(apiUrl(`/api/profile/${walletAddress}`), { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await readJsonOrText(res);
    throw new Error(body?.error ?? body?.message ?? String(body) ?? "Failed to load profile");
  }
  const body = await readJsonOrText(res);
  return toUserProfile(body, walletAddress);
}

export type ProfileChallenge = { nonce: string; message: string };

/**
 * Optional endpoint: if present, the backend can require a signature for profile updates.
 * If it returns 404, we treat it as "no challenge required".
 */
export async function requestProfileUpdateChallenge(walletAddress: string): Promise<ProfileChallenge | null> {
  if (!API_BASE) return null;
  const res = await fetch(apiUrl(`/api/profile/challenge`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await readJsonOrText(res);
    throw new Error(body?.error ?? body?.message ?? String(body) ?? "Failed to start profile update");
  }
  const body = await readJsonOrText(res);
  return { nonce: body.nonce, message: body.message };
}

export type SaveProfileInput = {
  walletAddress: string;
  username: string | null;
  bio: string | null;
  avatarUrl?: string | null;

  // If you provide signature+nonce, we will send them as-is.
  signature?: string | null;
  nonce?: string | null;

  // If signature isn't provided, and the backend supports challenge,
  // we can sign automatically.
  signer?: JsonRpcSigner | null;
};

export async function saveUserProfile(input: SaveProfileInput): Promise<UserProfile> {
  const { walletAddress } = input;

  let signature = input.signature ?? null;
  let nonce = input.nonce ?? null;

  if (!signature) {
    const challenge = await requestProfileUpdateChallenge(walletAddress);
    if (challenge) {
      if (!input.signer) throw new Error("Wallet signer is not available. Connect your wallet and try again.");
      nonce = challenge.nonce;
      signature = await input.signer.signMessage(challenge.message);
    }
  }

  const res = await fetch(apiUrl(`/api/profile`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      username: input.username,
      bio: input.bio,
      avatarUrl: input.avatarUrl,
      signature,
      nonce,
    }),
  });

  if (!res.ok) {
    const body = await readJsonOrText(res);
    throw new Error(body?.error ?? body?.message ?? String(body) ?? "Failed to save profile");
  }

  const body = await readJsonOrText(res);
  return toUserProfile(body, walletAddress);
}
