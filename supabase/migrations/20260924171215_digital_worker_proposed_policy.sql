-- Proposed evidence release terms for test-mode evaluation. A policy row does not grant
-- publication and proposed status cannot accept live money.
begin;

insert into public.delivery_policies (category_key, version, status, release_rule, terms) values
  ('digital_workers', 1, 'proposed', 'evidence', jsonb_build_object(
    'summary', 'The worker documents each agreed placement. The sponsor receives a credit on eligible worker-controlled channels or a public project page.',
    'materials', 'The approved sponsor name or credit line, link if agreed, and optional mark. Due within the materials window.',
    'approval', 'The worker accepts or declines the materials once. Acceptance is not delivery.',
    'release', 'The organizer''s share is released as each deliverable has evidence attached, once the materials are accepted. Never on a calendar.',
    'evidence', 'Organizer-supplied. A dated, redacted signature sample and eligible send count; a solo background preview and qualifying-call count; or a dated capture and public URL for a project-page credit. Private to the sponsor, organizer and Door Money unless the organizer publishes an item. Counts do not prove views.',
    'organizer_cancellation', 'Every unreleased share is refunded, fee included on that share.',
    'sponsor_cancellation', 'A full refund until the materials are accepted. Not offered after.',
    'unresolved_materials', 'Held. Open: decision 16.',
    'missed_goal', 'No effect on a purchased sponsorship.'));

do $$
begin
  if not exists (select 1 from public.fundraiser_categories where key = 'digital_workers' and draft_enabled and not publish_enabled) then
    raise exception 'digital_workers must remain draft-only when the proposed policy is added';
  end if;
  if not exists (select 1 from public.delivery_policies where category_key = 'digital_workers'
      and version = 1 and status = 'proposed' and release_rule = 'evidence') then
    raise exception 'digital_workers policy must be proposed and evidence-based';
  end if;
end $$;

commit;
