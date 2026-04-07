import { describe, it, expect, beforeEach } from "vitest"
import { MemoryAdapter } from "./persistenceAdapter.js"
import { EncryptedAdapter } from "./encryptedAdapter.js"
import type { EncryptionFunctions } from "./encryptedAdapter.js"

// Simple reversible "encryption" for testing (ROT13-like XOR)
function createTestEncryption(): EncryptionFunctions {
  return {
    async encrypt(plaintext: string): Promise<string> {
      return Buffer.from(plaintext).map((b) => b ^ 0x42).toString("base64")
    },
    async decrypt(ciphertext: string): Promise<string> {
      return Buffer.from(
        Buffer.from(ciphertext, "base64").map((b) => b ^ 0x42),
      ).toString()
    },
  }
}

describe("EncryptedAdapter", () => {
  let inner: MemoryAdapter
  let adapter: EncryptedAdapter
  let encryption: EncryptionFunctions

  beforeEach(() => {
    inner = new MemoryAdapter()
    encryption = createTestEncryption()
    adapter = new EncryptedAdapter(inner, encryption)
  })

  describe("getItem / setItem", () => {
    it("round-trips data correctly", async () => {
      const data = { id: 1, title: "Test", tags: ["a", "b"] }
      await adapter.setItem("key1", data)
      const result = await adapter.getItem("key1")
      expect(result).toEqual(data)
    })

    it("returns null for missing keys", async () => {
      expect(await adapter.getItem("missing")).toBeNull()
    })

    it("stores encrypted data in inner adapter", async () => {
      const data = { secret: "password123" }
      await adapter.setItem("key1", data)

      const raw = await inner.getItem<string>("key1")
      expect(raw).not.toBeNull()
      expect(typeof raw).toBe("string")
      // Raw should NOT be the plaintext JSON
      expect(raw).not.toBe(JSON.stringify(data))
      // But we should be able to decrypt it
      const decrypted = await encryption.decrypt(raw!)
      expect(JSON.parse(decrypted)).toEqual(data)
    })

    it("handles string values", async () => {
      await adapter.setItem("str", "hello world")
      expect(await adapter.getItem("str")).toBe("hello world")
    })

    it("handles array values", async () => {
      const arr = [1, 2, 3]
      await adapter.setItem("arr", arr)
      expect(await adapter.getItem("arr")).toEqual(arr)
    })

    it("handles null values in objects", async () => {
      const data = { a: null, b: 1 }
      await adapter.setItem("nulls", data)
      expect(await adapter.getItem("nulls")).toEqual(data)
    })
  })

  describe("removeItem", () => {
    it("removes items from inner adapter", async () => {
      await adapter.setItem("key1", "value")
      await adapter.removeItem("key1")
      expect(await adapter.getItem("key1")).toBeNull()
    })
  })

  describe("multiSet", () => {
    it("encrypts all values in batch", async () => {
      await adapter.multiSet([
        ["k1", { id: 1 }],
        ["k2", { id: 2 }],
        ["k3", { id: 3 }],
      ])

      expect(await adapter.getItem("k1")).toEqual({ id: 1 })
      expect(await adapter.getItem("k2")).toEqual({ id: 2 })
      expect(await adapter.getItem("k3")).toEqual({ id: 3 })

      // Verify inner has encrypted values
      const raw = await inner.getItem<string>("k1")
      expect(raw).not.toBe(JSON.stringify({ id: 1 }))
    })

    it("falls back to individual setItem when inner has no multiSet", async () => {
      const plainAdapter: any = {
        getItem: inner.getItem.bind(inner),
        setItem: inner.setItem.bind(inner),
        removeItem: inner.removeItem.bind(inner),
        // No multiSet
      }
      const encrypted = new EncryptedAdapter(plainAdapter, encryption)
      await encrypted.multiSet([
        ["a", 1],
        ["b", 2],
      ])
      expect(await encrypted.getItem("a")).toBe(1)
      expect(await encrypted.getItem("b")).toBe(2)
    })
  })

  describe("keys", () => {
    it("delegates to inner adapter", async () => {
      await adapter.setItem("zs:a", 1)
      await adapter.setItem("zs:b", 2)
      await adapter.setItem("other", 3)

      const keys = await adapter.keys("zs:")
      expect(keys).toEqual(expect.arrayContaining(["zs:a", "zs:b"]))
      expect(keys).not.toContain("other")
    })

    it("throws if inner adapter has no keys()", async () => {
      const minimal: any = {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      }
      const encrypted = new EncryptedAdapter(minimal, encryption)
      await expect(encrypted.keys()).rejects.toThrow("does not support keys()")
    })
  })

  describe("clear", () => {
    it("delegates to inner adapter", async () => {
      await adapter.setItem("k1", "v1")
      await adapter.setItem("k2", "v2")
      await adapter.clear()

      expect(await adapter.getItem("k1")).toBeNull()
      expect(await adapter.getItem("k2")).toBeNull()
    })

    it("throws if inner adapter has no clear()", async () => {
      const minimal: any = {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      }
      const encrypted = new EncryptedAdapter(minimal, encryption)
      await expect(encrypted.clear()).rejects.toThrow("does not support clear()")
    })
  })

  describe("error propagation", () => {
    it("propagates encryption errors", async () => {
      const failEncryption: EncryptionFunctions = {
        async encrypt(): Promise<string> {
          throw new Error("encrypt failed")
        },
        async decrypt(): Promise<string> {
          throw new Error("decrypt failed")
        },
      }
      const failAdapter = new EncryptedAdapter(inner, failEncryption)
      await expect(failAdapter.setItem("k", "v")).rejects.toThrow(
        "encrypt failed",
      )
    })

    it("propagates decryption errors", async () => {
      // Store raw data that can't be decrypted
      await inner.setItem("bad", "not-valid-encrypted-data")
      const failDecrypt: EncryptionFunctions = {
        async encrypt(p: string): Promise<string> {
          return p
        },
        async decrypt(): Promise<string> {
          throw new Error("decrypt failed")
        },
      }
      const failAdapter = new EncryptedAdapter(inner, failDecrypt)
      await expect(failAdapter.getItem("bad")).rejects.toThrow(
        "decrypt failed",
      )
    })
  })
})
