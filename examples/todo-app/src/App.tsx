/**
 * Example: Complete Todo app using zustand-supabase.
 *
 * Demonstrates:
 * - useQuery for data fetching with filters
 * - useMutation for CRUD operations
 * - useAuth for authentication
 * - useRealtime for live updates
 * - Optimistic updates (_zs_pending)
 * - Offline support (queue status)
 * - React Suspense integration
 */
import React, { Suspense, useState } from "react"
import {
  useQuery,
  useMutation,
  useAuth,
  useRealtime,
  useSuspenseQuery,
  createTableHook,
  eq,
  query,
} from "zustand-supabase"
import { stores, todosStore } from "./stores"

// ─── Auth ────────────────────────────────────────────────────────────

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading, signIn, signOut, user } = useAuth(stores.auth)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  if (isLoading) return <div>Loading auth...</div>

  if (!session) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          await signIn({ email, password })
        }}
      >
        <h2>Sign In</h2>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <button type="submit">Sign In</button>
      </form>
    )
  }

  return (
    <div>
      <header>
        <span>Signed in as {(user as any)?.email}</span>
        <button onClick={signOut}>Sign Out</button>
      </header>
      {children}
    </div>
  )
}

// ─── Todo List with useQuery ─────────────────────────────────────────

function TodoList() {
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all")

  // Build filters based on current filter
  const filterDescriptors =
    filter === "active"
      ? [eq<any, "completed">("completed", false)]
      : filter === "completed"
        ? [eq<any, "completed">("completed", true)]
        : []

  const { data, isLoading, error, refetch } = useQuery(stores.todos, {
    filters: filterDescriptors,
    deps: [filter], // Refetch when filter changes
  })

  const { insert, remove, isLoading: isMutating } = useMutation(stores.todos)
  const { status: realtimeStatus } = useRealtime(stores.todos)
  const [newTitle, setNewTitle] = useState("")

  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <h1>Todos</h1>

      {/* Status indicators */}
      <div>
        <span>Realtime: {realtimeStatus}</span>
        {" | "}
        <span>Queue: {stores.todos.getState().getQueueSize()} pending</span>
      </div>

      {/* Filter tabs */}
      <div>
        {(["all", "active", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ fontWeight: filter === f ? "bold" : "normal" }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Add todo */}
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!newTitle.trim()) return
          await insert({ title: newTitle.trim() })
          setNewTitle("")
        }}
      >
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="What needs to be done?"
          disabled={isMutating}
        />
        <button type="submit" disabled={isMutating}>
          Add
        </button>
      </form>

      {/* Todo list */}
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <ul>
          {data.map((todo) => (
            <TodoItem key={todo.id} todo={todo} onDelete={remove} />
          ))}
        </ul>
      )}

      <button onClick={refetch}>Refresh</button>
    </div>
  )
}

// ─── Todo Item ───────────────────────────────────────────────────────

const useTodos = createTableHook(todosStore)

function TodoItem({
  todo,
  onDelete,
}: {
  todo: any
  onDelete: (id: string) => Promise<void>
}) {
  const toggleComplete = useTodos((s) => s.toggleComplete)
  const isPending = !!todo._zs_pending

  return (
    <li style={{ opacity: isPending ? 0.6 : 1 }}>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => toggleComplete(todo.id)}
      />
      <span
        style={{
          textDecoration: todo.completed ? "line-through" : "none",
        }}
      >
        {todo.title}
      </span>
      {isPending && <span> (saving...)</span>}
      <button onClick={() => onDelete(todo.id)}>X</button>
    </li>
  )
}

// ─── Suspense Example ────────────────────────────────────────────────

function SuspenseTodoList() {
  const data = useSuspenseQuery(stores.todos)

  return (
    <div>
      <h2>Todos (Suspense)</h2>
      <ul>
        {data.map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </div>
  )
}

// ─── Fluent Query Builder Example ────────────────────────────────────

function HighPriorityTodos() {
  const { data } = useQuery(
    stores.todos,
    query<any>()
      .where("completed").eq(false)
      .where("priority").gte(3)
      .orderBy("priority", "desc")
      .limit(5)
      .build(),
  )

  return (
    <div>
      <h2>High Priority</h2>
      <ul>
        {data.map((t) => (
          <li key={t.id}>
            [{t.priority}] {t.title}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthGate>
      <TodoList />
      <HighPriorityTodos />
      <Suspense fallback={<div>Loading with Suspense...</div>}>
        <SuspenseTodoList />
      </Suspense>
    </AuthGate>
  )
}
