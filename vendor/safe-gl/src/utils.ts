export function addLineNumbers(text: string) {
  const suffix = ": ";
  const lines = text.split("\n");
  const leftPad = (lines.length + suffix).length;
  const formatted: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    formatted.push((i + suffix).padStart(leftPad, " "), lines[i], "\n");
  }
  return formatted.join("");
}
