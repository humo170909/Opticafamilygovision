/* router.js — Protección de rutas por rol */
import { checkAuth } from './auth.js';

export const protectRoute  = (roles = null) => checkAuth(roles);
export const protectAdmin  = ()             => checkAuth(['admin']);
export const protectVendor = ()             => checkAuth(['admin', 'vendedor']);
