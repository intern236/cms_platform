import 'server-only'
import { sys } from '@/lib/db'

export async function userCount(): Promise<number> {
  return (await sys()).users.count()
}
