export type User = {
  uuid: string
  name: string
  email: string
}

export type Company = {
  uuid: string
  name: string
  slug?: string | null
  kind?: 'personal' | 'team'
}

export type Role = 'admin' | 'user'
