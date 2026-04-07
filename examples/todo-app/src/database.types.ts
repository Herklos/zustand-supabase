/**
 * Example Supabase Database types.
 * In a real project, generate this with: npx supabase gen types typescript
 */
export type Database = {
  public: {
    Tables: {
      todos: {
        Row: {
          id: string
          title: string
          completed: boolean
          priority: number
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          title: string
          completed?: boolean
          priority?: number
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          id?: string
          title?: string
          completed?: boolean
          priority?: number
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          username: string
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          username: string
          avatar_url?: string | null
        }
        Update: {
          username?: string
          avatar_url?: string | null
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
