// Public configuration only. Auth and entitlement are enforced by the server.
export const CONFIG = Object.freeze({
  projectUrl: 'https://vyhhzhayloesxvosbwtc.supabase.co',
  publicKey: 'sb_publishable_e4-KpBxu4tmyt38n8fWKmQ_UH4cVCby',
  endpoint: 'https://vyhhzhayloesxvosbwtc.supabase.co/functions/v1/protected-read-owner-test',
  redirect: 'https://weihongliu6.github.io/reader-test/',
  // Remains false until deployment and Auth redirect are independently verified.
  loginEnabled: false,
});
