const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

export function countSourceWords(text: string) {
  return text.normalize("NFKC").match(TOKEN_PATTERN)?.length ?? 0;
}

export function countDocumentWords(texts: string[]) {
  return texts.reduce((total, text) => total + countSourceWords(text), 0);
}
