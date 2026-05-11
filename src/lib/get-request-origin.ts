/** Build absolute origin for same-deployment server fetches (audit trigger, etc.). */
export function getRequestOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (!host) {
    return "http://127.0.0.1:3000";
  }
  return `${proto}://${host}`;
}
