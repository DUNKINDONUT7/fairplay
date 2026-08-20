/**
 * authService.js — Mock implementation (no backend required)
 * Uses localStorage + mockUsers for login/register/session.
 */

import { mockUsers } from '../data/users';

const LS_REGISTERED = 'fairplay_registered_users';

function getRegisteredUsers() {
  try {
    const raw = localStorage.getItem(LS_REGISTERED);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRegisteredUser(user) {
  const existing = getRegisteredUsers();
  existing.push(user);
  localStorage.setItem(LS_REGISTERED, JSON.stringify(existing));
}

function getAllUsers() {
  return [...mockUsers, ...getRegisteredUsers()];
}

// Simple token: base64 of payload
function makeToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  return btoa(JSON.stringify(payload));
}

function parseToken(token) {
  try {
    return JSON.parse(atob(token));
  } catch {
    return null;
  }
}

function sanitizeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function login({ email, password }) {
  await delay(300);
  const all = getAllUsers();
  const found = all.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!found) {
    throw new Error('Invalid email or password.');
  }
  const token = makeToken(found);
  return { user: sanitizeUser(found), token };
}

export async function register({ name, email, password, role }) {
  await delay(300);
  const all = getAllUsers();
  if (all.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Email is already registered.');
  }
  const newUser = {
    id: Date.now(),
    name,
    email,
    password,
    role: role || 'participant',
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
    joinDate: new Date().toISOString().split('T')[0],
    status: 'active',
  };
  saveRegisteredUser(newUser);
  const token = makeToken(newUser);
  return { user: sanitizeUser(newUser), token };
}

export async function me(token) {
  await delay(100);
  const payload = parseToken(token);
  if (!payload) throw new Error('Invalid token');
  if (Date.now() > payload.exp) throw new Error('Token expired');
  const all = getAllUsers();
  const found = all.find((u) => u.id === payload.id);
  if (!found) throw new Error('User not found');
  return { user: sanitizeUser(found) };
}

export async function logout() {
  return { success: true };
}
