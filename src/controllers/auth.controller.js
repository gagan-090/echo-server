import * as authService from '../services/auth.service.js';
import * as phoneService from '../services/phone.service.js';
import * as emailService from '../services/email.service.js';
import { env } from '../config/env.js';

const cookieOpts = {
  httpOnly: true,
  secure: env.COOKIE_SECURE === 'true',
  sameSite: env.COOKIE_SAME_SITE,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth',
};

function getClientInfo(req) {
  return {
    userAgent: req.headers['user-agent'] || null,
    ip: req.ip || req.connection?.remoteAddress || null,
  };
}

export async function login(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await authService.login(
      req.body.email,
      req.body.password,
      getClientInfo(req)
    );
    res.cookie('refreshToken', refreshToken, cookieOpts);
    res.json({ data: { user, accessToken } });
  } catch (err) {
    next(err);
  }
}

export async function register(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await authService.register(
      req.body.email,
      req.body.password,
      req.body.display_name,
      getClientInfo(req)
    );
    res.cookie('refreshToken', refreshToken, cookieOpts);
    res.status(201).json({ data: { user, accessToken } });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies.refreshToken;
    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'No refresh token', statusCode: 401 });
    }
    const { accessToken, refreshToken: newRefresh } = await authService.refresh(
      token,
      getClientInfo(req)
    );
    res.cookie('refreshToken', newRefresh, cookieOpts);
    res.json({ data: { accessToken } });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const token = req.cookies.refreshToken;
    if (token) await authService.logout(token);
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ data: { message: 'Logged out' } });
  } catch (err) {
    next(err);
  }
}

// ==============================================
// PHONE AUTH
// ==============================================
export async function sendPhoneOtp(req, res, next) {
  try {
    const { phoneNumber, purpose } = req.body;
    if (!phoneNumber || !purpose) return res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing phone or purpose' });
    const result = await phoneService.sendOTP(phoneNumber, purpose);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function verifyPhoneOtp(req, res, next) {
  try {
    const { phoneNumber, code, purpose } = req.body;
    if (!phoneNumber || !code || !purpose) return res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing fields' });
    
    const { user, isNewUser } = await phoneService.verifyOTP(phoneNumber, code, purpose);
    
    if (user) {
      const { accessToken, refreshToken } = await authService.generateTokensForUser(user.id, getClientInfo(req));
      res.cookie('refreshToken', refreshToken, cookieOpts);
      return res.json({ data: { user, accessToken, isNewUser } });
    }
    
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}

// ==============================================
// EMAIL AUTH
// ==============================================
export async function registerEmail(req, res, next) {
  try {
    const { email, password, display_name } = req.body;
    const result = await emailService.register(email, password, display_name);
    
    if (!result.isResend) {
      await emailService.sendVerificationEmail(result.userId, email, display_name, 'verify_email');
    }
    
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmailTokenHandler(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing token' });
    
    const { user, isNewUser } = await emailService.verifyEmailToken(token);
    
    if (user) {
      const { accessToken, refreshToken } = await authService.generateTokensForUser(user.id, getClientInfo(req));
      res.cookie('refreshToken', refreshToken, cookieOpts);
      return res.json({ data: { user, accessToken, isNewUser } });
    }
    
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}

export async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;
    // Basic success response for security
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}

export async function loginEmail(req, res, next) {
  try {
    const { email, password } = req.body;
    const { user } = await emailService.login(email, password);
    
    const { accessToken, refreshToken } = await authService.generateTokensForUser(user.id, getClientInfo(req));
    res.cookie('refreshToken', refreshToken, cookieOpts);
    res.json({ data: { user, accessToken } });
  } catch (err) {
    next(err);
  }
}
