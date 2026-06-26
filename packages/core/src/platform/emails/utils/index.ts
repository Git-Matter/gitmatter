const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:4280";

export function previewUrl(path: string): string {
  return new URL(path, origin).toString();
}

export function previewAuthUrl(path: string): string {
  return previewUrl(`/api/auth${path}`);
}
