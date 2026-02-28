import { describe, expect, it } from "vitest";

import { base64urlToBuffer, bufferToBase64url, concatBuffers } from "./utils";

function bytesOf(...values: number[]): ArrayBuffer {
	return new Uint8Array(values).buffer;
}

function toBytes(buf: ArrayBuffer): number[] {
	return [...new Uint8Array(buf)];
}

describe("base64url round-trip", () => {
	it("round-trips ASCII text", () => {
		const text = "Hello, world!";
		const encoded = bufferToBase64url(new TextEncoder().encode(text).buffer);
		const decoded = new TextDecoder().decode(base64urlToBuffer(encoded));
		expect(decoded).toBe(text);
	});

	it("round-trips binary data (0x00-0xFF)", () => {
		const bytes = new Uint8Array(256);
		for (let i = 0; i < 256; i++) bytes[i] = i;
		const encoded = bufferToBase64url(bytes.buffer);
		const decoded = new Uint8Array(base64urlToBuffer(encoded));
		expect(toBytes(decoded.buffer)).toEqual(toBytes(bytes.buffer));
	});
});

describe("base64urlToBuffer", () => {
	it("handles input with no padding needed", () => {
		const buf = base64urlToBuffer("AQID");
		expect(toBytes(buf)).toEqual([1, 2, 3]);
	});

	it("handles input that would need padding chars", () => {
		expect(toBytes(base64urlToBuffer("AQ"))).toEqual([1]);
		expect(toBytes(base64urlToBuffer("AQI"))).toEqual([1, 2]);
	});

	it("decodes URL-safe chars (- and _) correctly", () => {
		const buf = base64urlToBuffer("P7__");
		expect(toBytes(buf)).toEqual([0x3f, 0xbf, 0xff]);

		// [0xF8] → base64 "+A==" → base64url "-A"
		const input = new Uint8Array([0xf8]);
		const encoded = bufferToBase64url(input.buffer);
		expect(encoded).toContain("-");
		expect(toBytes(base64urlToBuffer(encoded))).toEqual([0xf8]);
	});

	it("returns an empty ArrayBuffer for empty string input", () => {
		expect(base64urlToBuffer("").byteLength).toBe(0);
	});
});

describe("bufferToBase64url", () => {
	it("strips trailing = padding", () => {
		expect(bufferToBase64url(bytesOf(1))).toBe("AQ");
		expect(bufferToBase64url(bytesOf(1, 2))).toBe("AQI");
	});

	it("returns empty string for empty ArrayBuffer", () => {
		expect(bufferToBase64url(new ArrayBuffer(0))).toBe("");
	});
});

describe("concatBuffers", () => {
	it("returns an empty ArrayBuffer when called with zero buffers", () => {
		expect(concatBuffers().byteLength).toBe(0);
	});

	it("returns a copy with the same contents for a single buffer", () => {
		expect(toBytes(concatBuffers(bytesOf(10, 20, 30)))).toEqual([10, 20, 30]);
	});

	it("concatenates multiple buffers in order", () => {
		const result = concatBuffers(bytesOf(1, 2), bytesOf(3), bytesOf(4, 5, 6));
		expect(toBytes(result)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it("handles empty buffers mixed with non-empty buffers", () => {
		const result = concatBuffers(new ArrayBuffer(0), bytesOf(7, 8), new ArrayBuffer(0));
		expect(toBytes(result)).toEqual([7, 8]);
	});
});
