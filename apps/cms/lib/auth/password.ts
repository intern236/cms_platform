import 'server-only'
import bcrypt from 'bcryptjs'

const COST = 12

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 200

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password: string, context: { email?: string; name?: string } = {}): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`
  const lower = password.toLowerCase()
  if (/^(.)\1+$/.test(password)) return 'That is one character repeated. Pick something harder to guess.'
  /* A common word plus a few digits is still a common password. */
  const rest = COMMON.reduce((t, word) => t.split(word).join(''), lower)
  if (rest.length < lower.length && (rest.replace(/[^a-z]/g, '').length < 4 || new Set(rest).size < 5)) {
    return 'That is too close to a common password.'
  }
  const local = context.email?.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && lower.includes(local)) return 'Do not include your email address.'
  return null
}

const COMMON = ['password', 'qwerty', '123456', 'letmein', 'admin', 'welcome', 'iloveyou', 'abc123']

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST)
}

/**
 * Compared against a fixed dummy hash when the account does not exist, so a wrong
 * email and a wrong password take the same time and cannot be told apart.
 */
const DUMMY = '$2b$12$7fOF5G4tmO3EVCXXdy39AOkBE/C8L99gk3STCumqDZHMBlNvOEWge'

export async function checkPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!password || password.length > PASSWORD_MAX) {
    await bcrypt.compare('x', DUMMY)
    return false
  }
  if (!hash) {
    await bcrypt.compare(password, DUMMY)
    return false
  }
  return bcrypt.compare(password, hash)
}
