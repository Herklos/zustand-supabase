import { describe, it, expect } from "vitest"
import {
  remoteWins,
  localWins,
  lastWriteWins,
  fieldLevelMerge,
  resolveConflict,
} from "./conflictResolution.js"
import type { ConflictContext, TrackedRow } from "../types.js"

type Row = {
  id: number
  title: string
  completed: boolean
  priority: number
  updated_at: string
}

const baseContext: ConflictContext = {
  table: "todos",
  primaryKey: { id: 1 },
  hasPendingMutations: false,
  pendingMutations: [],
}

describe("remoteWins", () => {
  it("always returns the remote row", () => {
    const resolver = remoteWins<Row>()
    const local: TrackedRow<Row> = {
      id: 1, title: "Local", completed: false, priority: 1, updated_at: "2024-01-01",
      _anchor_pending: "update",
    }
    const remote: Row = {
      id: 1, title: "Remote", completed: true, priority: 2, updated_at: "2024-01-02",
    }

    expect(resolver(local, remote, baseContext)).toEqual(remote)
  })
})

describe("localWins", () => {
  it("returns the local row without metadata", () => {
    const resolver = localWins<Row>()
    const local: TrackedRow<Row> = {
      id: 1, title: "Local", completed: false, priority: 1, updated_at: "2024-01-01",
      _anchor_pending: "update",
      _anchor_optimistic: true,
      _anchor_mutationId: "m1",
    }
    const remote: Row = {
      id: 1, title: "Remote", completed: true, priority: 2, updated_at: "2024-01-02",
    }

    const result = resolver(local, remote, baseContext)
    expect(result).toEqual({
      id: 1, title: "Local", completed: false, priority: 1, updated_at: "2024-01-01",
    })
    // Verify metadata stripped
    expect(result).not.toHaveProperty("_anchor_pending")
    expect(result).not.toHaveProperty("_anchor_optimistic")
    expect(result).not.toHaveProperty("_anchor_mutationId")
  })
})

describe("lastWriteWins", () => {
  it("returns remote when remote is newer", () => {
    const resolver = lastWriteWins<Row>()
    const local: TrackedRow<Row> = {
      id: 1, title: "Local", completed: false, priority: 1, updated_at: "2024-01-01T00:00:00Z",
    }
    const remote: Row = {
      id: 1, title: "Remote", completed: true, priority: 2, updated_at: "2024-01-02T00:00:00Z",
    }

    expect(resolver(local, remote, baseContext)).toEqual(remote)
  })

  it("returns local (without meta) when local is newer", () => {
    const resolver = lastWriteWins<Row>()
    const local: TrackedRow<Row> = {
      id: 1, title: "Local", completed: false, priority: 1, updated_at: "2024-01-03T00:00:00Z",
      _anchor_pending: "update",
    }
    const remote: Row = {
      id: 1, title: "Remote", completed: true, priority: 2, updated_at: "2024-01-02T00:00:00Z",
    }

    const result = resolver(local, remote, baseContext)
    expect((result as any).title).toBe("Local")
    expect(result).not.toHaveProperty("_anchor_pending")
  })

  it("returns remote on tie (server wins as authoritative source)", () => {
    const resolver = lastWriteWins<Row>()
    const ts = "2024-01-01T00:00:00Z"
    const local: TrackedRow<Row> = {
      id: 1, title: "Local", completed: false, priority: 1, updated_at: ts,
    }
    const remote: Row = {
      id: 1, title: "Remote", completed: true, priority: 2, updated_at: ts,
    }

    const result = resolver(local, remote, baseContext)
    expect((result as any).title).toBe("Remote")
  })

  it("returns remote when timestamps are missing", () => {
    const resolver = lastWriteWins<Row>()
    const local: TrackedRow<Row> = {
      id: 1, title: "Local", completed: false, priority: 1, updated_at: "",
    }
    const remote: Row = {
      id: 1, title: "Remote", completed: true, priority: 2, updated_at: "",
    }

    expect(resolver(local, remote, baseContext)).toEqual(remote)
  })

  it("supports custom timestamp column", () => {
    type RowWithModified = Row & { modified_at: string }
    const resolver = lastWriteWins<RowWithModified>("modified_at")
    const local: TrackedRow<RowWithModified> = {
      id: 1, title: "Local", completed: false, priority: 1,
      updated_at: "2024-01-01", modified_at: "2024-01-03T00:00:00Z",
    }
    const remote: RowWithModified = {
      id: 1, title: "Remote", completed: true, priority: 2,
      updated_at: "2024-01-02", modified_at: "2024-01-01T00:00:00Z",
    }

    const result = resolver(local, remote, baseContext)
    expect((result as any).title).toBe("Local")
  })
})

describe("fieldLevelMerge", () => {
  it("uses local values when local is newer", () => {
    const resolver = fieldLevelMerge<Row>()
    const local: TrackedRow<Row> = {
      id: 1, title: "Local title", completed: false, priority: 3,
      updated_at: "2024-01-02T00:00:00Z",
    }
    const remote: Row = {
      id: 1, title: "Remote title", completed: true, priority: 1,
      updated_at: "2024-01-01T00:00:00Z",
    }

    const result = resolver(local, remote, baseContext)
    expect((result as any).title).toBe("Local title")
    expect((result as any).priority).toBe(3)
  })

  it("respects serverOwnedFields", () => {
    const resolver = fieldLevelMerge<Row>({
      serverOwnedFields: ["priority"],
    })
    const local: TrackedRow<Row> = {
      id: 1, title: "Local", completed: false, priority: 99,
      updated_at: "2024-01-02T00:00:00Z",
    }
    const remote: Row = {
      id: 1, title: "Remote", completed: true, priority: 1,
      updated_at: "2024-01-01T00:00:00Z",
    }

    const result = resolver(local, remote, baseContext)
    // priority is server-owned, should use remote value
    expect((result as any).priority).toBe(1)
    // title is not server-owned, local is newer
    expect((result as any).title).toBe("Local")
  })

  it("respects clientOwnedFields", () => {
    const resolver = fieldLevelMerge<Row>({
      clientOwnedFields: ["title"],
    })
    const local: TrackedRow<Row> = {
      id: 1, title: "Client title", completed: false, priority: 1,
      updated_at: "2024-01-01T00:00:00Z", // older
    }
    const remote: Row = {
      id: 1, title: "Server title", completed: true, priority: 5,
      updated_at: "2024-01-02T00:00:00Z", // newer
    }

    const result = resolver(local, remote, baseContext)
    // title is client-owned, always use local
    expect((result as any).title).toBe("Client title")
    // Other fields use remote since remote is newer
    expect((result as any).completed).toBe(true)
  })
})

describe("resolveConflict", () => {
  it("returns remote when local is undefined", () => {
    const remote: Row = { id: 1, title: "Remote", completed: false, priority: 1, updated_at: "" }
    const result = resolveConflict(undefined, remote, {}, baseContext)
    expect(result).toEqual(remote)
  })

  it("uses configured strategy", () => {
    const local: TrackedRow<Row> = {
      id: 1, title: "Local", completed: false, priority: 1, updated_at: "2024-01-02",
    }
    const remote: Row = {
      id: 1, title: "Remote", completed: true, priority: 2, updated_at: "2024-01-01",
    }

    const lww = resolveConflict(local, remote, { strategy: "last-write-wins" }, baseContext)
    expect((lww as any).title).toBe("Local")

    const sw = resolveConflict(local, remote, { strategy: "server-wins" }, baseContext)
    expect((sw as any).title).toBe("Remote")
  })

  it("uses custom resolver when provided", () => {
    const local: TrackedRow<Row> = {
      id: 1, title: "Local", completed: false, priority: 1, updated_at: "",
    }
    const remote: Row = {
      id: 1, title: "Remote", completed: true, priority: 2, updated_at: "",
    }

    const result = resolveConflict(
      local,
      remote,
      {
        resolver: (l, r) => ({
          ...r,
          title: l.title, // Keep local title but use remote for everything else
        }),
      },
      baseContext,
    )

    expect((result as any).title).toBe("Local")
    expect((result as any).completed).toBe(true)
  })
})
