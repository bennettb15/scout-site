-- Allow due date workflow activity without mutating observations, shots, or report snapshots.

alter table public.punchlist_activity
    drop constraint if exists punchlist_activity_type_check;

alter table public.punchlist_activity
    add constraint punchlist_activity_type_check
    check (
        activity_type in (
            'note_added',
            'status_changed',
            'priority_changed',
            'due_date_changed',
            'trade_changed'
        )
    );
