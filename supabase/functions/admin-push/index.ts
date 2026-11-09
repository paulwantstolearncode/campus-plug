// ============================================================================
// admin-push Edge Function: drains public.push_messages and delivers Web Push
// ----------------------------------------------------------------------------
// Deploy:  supabase functions deploy admin-push --no-verify-jwt
// Secrets (set once via `supabase secrets set` or Dashboard -> Settings ->
// Edge Functions):
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  — from `npx web-push generate-vapid-keys`
//   PUSH_WORKER_SECRET                    — long random string; the pg_cron
//     job sends it as x-push-worker-secret so only the cron can invoke this.
//
// Runs every 2 minutes (cron job 'admin-push-drain' in add_web_push.sql).
// Sends each queued message to ALL push_subscriptions belonging to admins,
// then marks the messages processed. Expired/invalid subscriptions (404/410)
// are pruned automatically.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const WORKER_SECRET = Deno.env.get('PUSH_WORKER_SECRET') || ''

webpush.setVapidDetails(
  'mailto:admin@campuspluggh.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

Deno.serve(async (req) => {
  // Browser clients fetch the VAPID key to subscribe (CORS preflight + GET).
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization,x-push-worker-secret,content-type',
        'access-control-allow-methods': 'GET,POST',
      },
    })
  }

  const url = new URL(req.url)

  // GET /vapid-public-key — safe to expose (it's the public half of the pair).
  if (req.method === 'GET' && url.pathname.endsWith('/vapid-public-key')) {
    return json({ key: VAPID_PUBLIC_KEY }, 200)
  }

  // Everything else is the worker drain — require the shared secret.
  const provided = req.headers.get('x-push-worker-secret')
  if (!WORKER_SECRET || provided !== WORKER_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1. Unprocessed queue (bounded per run so a backlog drains gradually).
  const { data: messages, error: msgErr } = await supabase
    .from('push_messages')
    .select('id, title, body, link')
    .is('processed_at', null)
    .order('id', { ascending: true })
    .limit(50)

  if (msgErr) return json({ error: msgErr.message }, 500)
  if (!messages || messages.length === 0) return json({ sent: 0, drained: 0 })

  // 2. Subscriptions for admin users only.
  const { data: adminProfiles, error: adminErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true)

  if (adminErr) return json({ error: adminErr.message }, 500)
  const adminIds = (adminProfiles || []).map((a) => a.id)
  if (adminIds.length === 0) return json({ sent: 0, skipped: 'no admins' })

  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .in('user_id', adminIds)

  if (subErr) return json({ error: subErr.message }, 500)
  if (!subs || subs.length === 0) return json({ sent: 0, skipped: 'no subscriptions' })

  let sent = 0
  let failed = 0
  const pruneIds: string[] = []

  for (const message of messages) {
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.link || '/',
    })

    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth_key },
            },
            payload,
          )
          sent++
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) {
            // Subscription gone (user cleared data / browser uninstalled) — prune.
            pruneIds.push(s.id)
          } else {
            failed++
          }
        }
      }),
    )

    await supabase
      .from('push_messages')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', message.id)
  }

  if (pruneIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', pruneIds)
  }

  return json({
    drained: messages.length,
    sent,
    failed,
    pruned: pruneIds.length,
  })
})
