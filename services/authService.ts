import crypto from 'crypto';
import prisma from '../prisma/client';
import { config } from '../config';
import { signJwt } from '../lib/jwt';

const HASH_ALGO = 'scrypt';

export type AuthContext = {
  userId: string;
  organizationId: string;
  email?: string;
  role?: string;
  apiKeyId?: string;
};

export const hashPassword = (password: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${HASH_ALGO}:${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
};

export const verifyPassword = (password: string, storedHash?: string | null): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!storedHash) return resolve(false);
    const [algo, saltHex, hashHex] = storedHash.split(':');
    if (algo !== HASH_ALGO || !saltHex || !hashHex) return resolve(false);
    const salt = Buffer.from(saltHex, 'hex');
    const hash = Buffer.from(hashHex, 'hex');
    crypto.scrypt(password, salt, hash.length, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(hash, derivedKey));
    });
  });
};

const hashApiKey = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

export const registerUser = async (input: { email: string; password: string; name?: string }) => {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error('User already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const org = await prisma.organization.create({
    data: {
      name: `${input.name || email}'s Workspace`
    }
  });

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name,
      passwordHash,
      memberships: {
        create: {
          organizationId: org.id,
          role: 'owner'
        }
      }
    },
    include: { memberships: true }
  });

  const token = signJwt(
    { sub: user.id, orgId: org.id, email: user.email, role: 'owner' },
    config.jwtSecret,
    60 * 60 * 24 * 7
  );

  return { user, organization: org, token };
};

export const loginUser = async (input: { email: string; password: string }) => {
  const email = input.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
  if (!user || !user.passwordHash) {
    throw new Error('Invalid credentials');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  const membership = user.memberships[0];
  if (!membership) {
    throw new Error('No organization assigned');
  }

  const token = signJwt(
    { sub: user.id, orgId: membership.organizationId, email: user.email, role: membership.role },
    config.jwtSecret,
    60 * 60 * 24 * 7
  );

  return { user, organizationId: membership.organizationId, role: membership.role, token };
};

export const createApiKey = async (input: {
  userId: string;
  organizationId: string;
  label?: string;
  expiresAt?: Date;
}) => {
  const rawKey = `ak_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = hashApiKey(rawKey);

  const apiKey = await prisma.apiKey.create({
    data: {
      keyHash,
      label: input.label,
      userId: input.userId,
      organizationId: input.organizationId,
      expiresAt: input.expiresAt || null
    }
  });

  return { apiKey, key: rawKey };
};

export const validateApiKey = async (key: string): Promise<AuthContext | null> => {
  const keyHash = hashApiKey(key);
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      revoked: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    }
  });

  if (!apiKey) return null;

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() }
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: apiKey.userId, organizationId: apiKey.organizationId }
  });

  return {
    userId: apiKey.userId,
    organizationId: apiKey.organizationId,
    apiKeyId: apiKey.id,
    role: membership?.role
  };
};
