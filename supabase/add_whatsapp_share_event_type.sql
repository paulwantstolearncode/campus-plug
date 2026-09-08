-- Add 'whatsapp_share' to allowed analytics event types
ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_event_type_check
  CHECK (event_type IN ('listing_view', 'whatsapp_click', 'whatsapp_outcome', 'whatsapp_share'));
