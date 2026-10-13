import bcrypt from 'bcryptjs';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_HASH_ROUNDS = 12;

export function hashPassword(password: string): string {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد`);
  }
  return bcrypt.hashSync(password, PASSWORD_HASH_ROUNDS);
}

/**
 * Rehashes a password that has already been verified successfully.
 * Legacy accounts may predate the current minimum-length policy; blocking
 * those users during a cost-factor upgrade would turn a valid login into 500.
 */
export function rehashVerifiedPassword(password: string): string {
  return bcrypt.hashSync(password, PASSWORD_HASH_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(hash) && bcrypt.compareSync(password, hash);
}

export function passwordHashNeedsUpgrade(hash: string): boolean {
  const rounds = Number(hash.split('$')[2]);
  return !Number.isFinite(rounds) || rounds < PASSWORD_HASH_ROUNDS;
}

export function seedPassword(): string {
  const password = process.env.ELECIO_SEED_PASSWORD ?? '';
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`برای ساخت دیتابیس اولیه، ELECIO_SEED_PASSWORD را با حداقل ${PASSWORD_MIN_LENGTH} کاراکتر تنظیم کنید`);
  }
  return password;
}
