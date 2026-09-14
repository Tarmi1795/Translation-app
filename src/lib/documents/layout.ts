export type MeasureText = (text: string, size: number) => number;

export function wrapText(text: string, width: number, size: number, measure: MeasureText) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      // Split unusually long identifiers without dropping characters.
      for (const character of Array.from(word)) {
        if (line && measure(line + character, size) > width) { lines.push(line); line = ""; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function fitText(text: string, width: number, height: number, preferredSize: number, measure: MeasureText) {
  const preferred = Math.min(36, Math.max(9, preferredSize));
  for (let size = preferred; size >= 9; size -= 0.5) {
    const lines = wrapText(text, width, size, measure);
    const lineHeight = size * 1.35;
    if (lines.length * lineHeight <= height && lines.every((line) => measure(line, size) <= width + 0.1)) return { size, lineHeight, lines };
  }
  return null;
}

export function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5 && a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;
}
