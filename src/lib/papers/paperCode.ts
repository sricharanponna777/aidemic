/**
 * Short code printed at the top of every paper.
 *
 * It exists so a student with three printouts on the desk can tell which one
 * they are uploading, and can label any extra sheet they carry on writing on.
 * The alphabet omits O/0 and I/1/L, which are exactly the characters people
 * mis-copy from their own handwriting.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generatePaperCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]);
  return `${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`;
}
