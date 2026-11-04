/*
 * EvidenceForge X
 * Browser-local SHA-256 evidence verification
 * Hash equality does not prove evidence provenance.
 */

export function hex(bytes) {
  return [...bytes]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Bytes(bytes) {
  if (!(bytes instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(bytes)) {
    throw Error("Expected binary data");
  }

  const raw = bytes instanceof ArrayBuffer
    ? bytes
    : bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      );

  if (!globalThis.crypto?.subtle) {
    throw Error("Secure browser context required");
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    raw
  );

  return hex(new Uint8Array(digest));
}

export function compareDigest(expected, actual) {
  if (typeof expected !== "string" ||
      !/^[0-9a-f]{64}$/i.test(expected)) {
    return {
      status: "no-valid-reference",
      match: false
    };
  }

  if (typeof actual !== "string" ||
      !/^[0-9a-f]{64}$/i.test(actual)) {
    throw Error("Invalid computed digest");
  }

  const match =
    expected.toLowerCase() === actual.toLowerCase();

  return {
    status: match ? "match" : "mismatch",
    match
  };
}

export async function verifyFile(
  file,
  referenceSha256,
  maxBytes = 20 * 1024 * 1024
) {
  if (!file ||
      !Number.isFinite(file.size) ||
      file.size < 0 ||
      file.size > maxBytes ||
      typeof file.arrayBuffer !== "function") {
    throw Error(
      "Invalid file or exceeds browser size limit"
    );
  }

  const actual = await sha256Bytes(
    await file.arrayBuffer()
  );

  return {
    name: file.name || "(unnamed)",
    size: file.size,
    sha256: actual,
    ...compareDigest(referenceSha256, actual)
  };
}
