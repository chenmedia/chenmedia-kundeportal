/* Logo fra Chen Media brandguideline V1. Svart på lyse flater, hvit på svart. */
export function Logo({ variant = "black", height = 40 }: { variant?: "black" | "white"; height?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/brand/logo-${variant}.png`} alt="Chen Media" height={height} width={Math.round(height * 3.31)} style={{ height, width: "auto" }} />;
}
export function Mark({ variant = "black", height = 40 }: { variant?: "black" | "white"; height?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/brand/mark-${variant}.png`} alt="" aria-hidden="true" height={height} width={height} style={{ height, width: "auto" }} />;
}
