import crypto from 'crypto';
import { pgGetActiveCustomerForSession, pgGetActiveDriverForSession, pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';
import type { MerchantTier } from '@/types';
export { hashPassword, verifyPassword } from '@/lib/password';

export const SESSION_COOKIE_NAME = 'etihad_admin_session';
export const CUSTOMER_SESSION_COOKIE_NAME = 'etihad_customer_session';
export const DRIVER_SESSION_COOKIE_NAME = 'etihad_driver_session';
export const SESSION_DURATION_SECONDS = 604800;
export const CUSTOMER_SESSION_DURATION_SECONDS = 2592000;
export const DRIVER_SESSION_DURATION_SECONDS = 2592000;

function getSessionSecret() { const value = process.env.ADMIN_SESSION_SECRET; if (value && value.trim().length >= 16) return value.trim(); if (process.env.NODE_ENV === 'production') throw new Error('SECURITY CONFIGURATION ERROR: ADMIN_SESSION_SECRET environment variable is missing or too short.'); return 'dev-local-test-secret-never-used-in-production'; }
function sign(payload: object) { const data = Buffer.from(JSON.stringify(payload)).toString('base64url'); const sig = crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url'); return `${data}.${sig}`; }
function verify<T extends { exp: number }>(token: string): T | null { if (!token) return null; const parts = token.split('.'); if (parts.length !== 2) return null; const [data, sig] = parts; const expected = crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url'); if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null; try { const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as T; return payload.exp >= Math.floor(Date.now()/1000) ? payload : null; } catch { return null; } }
function bearerOrCookie(request: Request, cookieName: string) { const auth = request.headers.get('authorization') || ''; if (auth.startsWith('Bearer ')) return auth.slice(7).trim(); const match = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`)); return match ? decodeURIComponent(match[1]) : null; }

export interface SessionPayload { userId: string; username: string; role: string; exp: number }
export interface AuthenticatedAdmin { id: string; name: string; username: string; role: 'admin'|'staff'; jobTitle?: string; permissions: string[]; isActive: boolean }
export const signAdminSession = (p: SessionPayload) => sign(p);
export const verifyAdminSessionToken = (t: string) => verify<SessionPayload>(t);
export function getSessionFromRequest(request: Request) { const token = bearerOrCookie(request, SESSION_COOKIE_NAME); if (!token) return null; const p = verifyAdminSessionToken(token); return p && (p.role === 'admin' || p.role === 'staff') ? p : null; }
export async function getAuthenticatedAdmin(request: Request): Promise<AuthenticatedAdmin|null> { const s = getSessionFromRequest(request); if (!s) return null; const staff = await pgGetActiveStaffForSession({userId:s.userId, username:s.username}); if (!staff) return null; const master = s.role === 'admin' || staff.role === 'admin' || staff.role === 'master'; return {id:staff.id,name:staff.name,username:staff.username,role:master?'admin':'staff',jobTitle:staff.jobTitle,permissions:master?['*']:staff.permissions,isActive:true}; }
export const getAuthenticatedAdminPg = getAuthenticatedAdmin;
export function hasPermission(admin: AuthenticatedAdmin|null, permission: string) { if (!admin?.isActive) return false; if (admin.role === 'admin') return true; const p=admin.permissions||[]; return p.includes('*') || p.includes(permission) || (permission.startsWith('accounting:')&&p.includes('accounting')) || (permission.startsWith('drivers:')&&(p.includes('drivers')||p.includes('accounting'))) || (permission.startsWith('vault:')&&p.includes('accounting')); }

export interface CustomerSessionPayload { userId:string; phone:string; email?:string; name?:string; role?:string; exp:number }
export interface AuthenticatedCustomer { id:string; phone:string; email?:string; name:string; accountType?:string; role?:string; merchantStatus?:string; pricingTier?:string; merchantTier?:MerchantTier; isActive:boolean }
export const signCustomerSession=(p:CustomerSessionPayload)=>sign(p);
export const verifyCustomerSessionToken=(t:string)=>verify<CustomerSessionPayload>(t);
export async function getAuthenticatedCustomer(request:Request):Promise<AuthenticatedCustomer|null>{const token=bearerOrCookie(request,CUSTOMER_SESSION_COOKIE_NAME); const p=token?verifyCustomerSessionToken(token):null; if(!p?.userId)return null; const u=await pgGetActiveCustomerForSession(p.userId); if(!u)return null; return {id:u.id,phone:u.phone,email:p.email,name:u.name,accountType:u.accountType,role:p.role,merchantStatus:u.merchantStatus,pricingTier:u.pricingTier,merchantTier:u.merchantTier,isActive:true};}
export const getAuthenticatedCustomerPg=getAuthenticatedCustomer;

export interface OrderTokenPayload { orderId:string; orderNumber?:string; phone?:string; exp:number }
export const signOrderAccessToken=(p:OrderTokenPayload)=>sign(p);
export const verifyOrderAccessToken=(t:string,id?:string)=>{const p=verify<OrderTokenPayload>(t); return p&&(!id||p.orderId===id)?p:null;};
export function getOrderAccessTokenFromRequest(request:Request,orderId?:string){try{const t=new URL(request.url).searchParams.get('token');if(t)return t;}catch{} const h=request.headers.get('x-order-token');if(h)return h; const a=request.headers.get('authorization')||'';if(a.startsWith('Bearer ')){const t=a.slice(7).trim();if(orderId&&verifyOrderAccessToken(t,orderId))return t;} const c=request.headers.get('cookie')||'';if(orderId){const m=c.match(new RegExp(`(?:^|;\\s*)etihad_order_token_${orderId}=([^;]+)`));if(m)return decodeURIComponent(m[1]);}const m=c.match(/(?:^|;\s*)etihad_order_token=([^;]+)/);return m?decodeURIComponent(m[1]):null;}

export interface DriverSessionPayload { driverId:string; authIdentityId?:string; phone:string; name:string; role:'driver'; exp:number }
export interface AuthenticatedDriver { id:string; authIdentityId:string; financialAccountId:string; name:string; phone:string; isActive:boolean }
export const signDriverSession=(p:DriverSessionPayload)=>sign(p);
export const verifyDriverSessionToken=(t:string)=>{const p=verify<DriverSessionPayload>(t);return p?.role==='driver'?p:null;};
export function getDriverSessionFromRequest(request:Request){const t=bearerOrCookie(request,DRIVER_SESSION_COOKIE_NAME);return t?verifyDriverSessionToken(t):null;}
export async function getAuthenticatedDriver(request:Request):Promise<AuthenticatedDriver|null>{const p=getDriverSessionFromRequest(request);if(!p)return null;const d=await pgGetActiveDriverForSession({driverId:p.driverId,authIdentityId:p.authIdentityId});return d?{id:d.id,authIdentityId:d.authIdentityId,financialAccountId:d.financialAccountId,name:d.name,phone:d.phone,isActive:true}:null;}
