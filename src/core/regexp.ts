/** `text` with every character that means something in a RegExp escaped. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * RegExp source (without anchors) of a glob: "*" stands for any run of
 * characters, everything else is literal.
 */
export function globSource(glob: string): string {
  return glob.split("*").map(escapeRegExp).join(".*");
}
