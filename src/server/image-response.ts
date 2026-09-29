export function imageResponse(data: Buffer, mime: string) {
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
export function notFoundResponse() {
  return new Response("Ikke funnet", { status: 404, headers: { "Cache-Control": "private, no-store" } });
}
