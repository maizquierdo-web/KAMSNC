ALTER TABLE public.alerts
  DROP CONSTRAINT IF EXISTS alerts_alert_type_check;

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_alert_type_check
  CHECK (
    alert_type IN (
      'task',
      'followup_overdue',
      'pipeline_stalled',
      'channel_inactive',
      'plan_review',
      'system',
      'channel_reassigned',
      'channel_critical_change',
      'onboarding_blocked',
      'benchmark_signal',
      'team_risk',
      'high_potential_movement'
    )
  );
