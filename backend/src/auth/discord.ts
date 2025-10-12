import { Strategy as DiscordStrategy, Profile } from 'passport-discord';
import type { PassportStatic } from 'passport';
import { PORT } from '../config/constants';

const parseCsvEnv = (value: string | undefined, normalize?: (input: string) => string): Set<string> => {
  if (!value) return new Set();
  return new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (normalize ? normalize(item) : item))
  );
};

const DISCORD_ALLOWED_USER_IDS = parseCsvEnv(process.env.DISCORD_ALLOWED_USER_IDS);
const DISCORD_ALLOWED_EMAILS = parseCsvEnv(process.env.DISCORD_ALLOWED_EMAILS, (email) => email.toLowerCase());
const DISCORD_ALLOWED_EMAIL_DOMAINS = parseCsvEnv(
  process.env.DISCORD_ALLOWED_EMAIL_DOMAINS,
  (domain) => domain.replace(/^\./, '').toLowerCase()
);

type DiscordWhitelistResult =
  | { allowed: true }
  | { allowed: false; code: 'discord_email_required' | 'discord_whitelist_denied'; detail: string };

const isDiscordWhitelistEnabled =
  DISCORD_ALLOWED_USER_IDS.size > 0 ||
  DISCORD_ALLOWED_EMAILS.size > 0 ||
  DISCORD_ALLOWED_EMAIL_DOMAINS.size > 0;

export const checkDiscordWhitelist = (profile: Profile): DiscordWhitelistResult => {
  if (!isDiscordWhitelistEnabled) {
    return { allowed: true };
  }

  const userId = profile.id;
  if (DISCORD_ALLOWED_USER_IDS.has(userId)) {
    return { allowed: true };
  }

  const email = (profile.email || '').toLowerCase();
  if (!email && (DISCORD_ALLOWED_EMAILS.size > 0 || DISCORD_ALLOWED_EMAIL_DOMAINS.size > 0)) {
    return {
      allowed: false,
      code: 'discord_email_required',
      detail: 'Discord account must have a verified email to access this application.',
    };
  }

  if (email && DISCORD_ALLOWED_EMAILS.has(email)) {
    return { allowed: true };
  }

  if (email) {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (domain && DISCORD_ALLOWED_EMAIL_DOMAINS.has(domain)) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    code: 'discord_whitelist_denied',
    detail: 'Your Discord account is not on the approved access list.',
  };
};

export const configureDiscordStrategy = (passport: PassportStatic) => {
  passport.use(
    new DiscordStrategy(
      {
        clientID: process.env.DISCORD_CLIENT_ID || '',
        clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
        callbackURL: `${process.env.BACKEND_URL || `http://localhost:${PORT}`}/auth/discord/callback`,
        scope: ['identify', 'email'],
      },
      (_accessToken, _refreshToken, profile, done) => {
        const whitelistResult = checkDiscordWhitelist(profile);
        if (whitelistResult.allowed === false) {
          const { code, detail } = whitelistResult;
          console.warn(`[AUTH] Discord user ${profile.id} rejected: ${detail} (code: ${code})`);
          return done(null, false, {
            message: code,
            detail,
          });
        }

        return done(null, {
          id: profile.id,
          username: profile.username,
          discriminator: profile.discriminator,
          avatar: profile.avatar,
          email: profile.email,
        });
      }
    )
  );
};
