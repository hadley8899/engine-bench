import type { Role, User } from './auth'

export type CompanyUser = {
  uuid: string
  role: Role
  user: User
}
