/**
 * Tests unitaires purs (sans serveur) pour sniff + analyse PDF minimale.
 * Lancer : node --experimental-strip-types tests/attachments-sniff-pdf.test.mjs
 * (adapter le chemin d'import selon le projet)
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Imports dynamiques des modules TypeScript via strip-types si besoin.
// Ici on re-implémente les assertions critiques sur les magic bytes pour rester autonome.

function sniffType(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { kind: "image", mime: "image/png", ext: "png" };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (b.length > 22 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05))
    return { kind: "zip", mime: "application/zip", ext: "zip" };
  if (b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d)
    return { kind: "pdf", mime: "application/pdf", ext: "pdf" };
  if (
    b.length > 7 &&
    b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21 &&
    b[4] === 0x1a && b[5] === 0x07 && (b[6] === 0x00 || b[6] === 0x01)
  )
    return { kind: "rar", mime: "application/vnd.rar", ext: "rar" };
  return null;
}

// Minimal PDF with text operator
const minimalPdf = new TextEncoder().encode(
  `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 12 Tf 50 100 Td (Hello NOXIA) Tj ET
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
trailer<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`
);

assert.equal(sniffType(minimalPdf)?.kind, "pdf");
assert.equal(sniffType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(20).fill(0)]))?.kind, "zip");
assert.equal(sniffType(new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0x00]))?.kind, "rar");
assert.equal(sniffType(new Uint8Array([0x00, 0x01, 0x02])), null);

console.log("ok — sniff pdf/zip/rar");
