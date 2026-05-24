import * as authService from '../services/auth.service.js';
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
