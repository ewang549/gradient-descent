-- Median game-clock seconds from a 4th-down snap to the next scrimmage snap, by outcome.
-- Late in a half the clock stops far more often, so the final two minutes get their own row.
-- Training seasons only (2006-2022): these are model parameters.

with outcomes as (

    select
        case
            when d.decision = 'go' and d.is_converted then 'go_converted'
            when d.decision = 'go' then 'go_failed'
            when d.decision = 'punt' then 'punt'
            when d.decision = 'field_goal' and d.is_fg_made then 'fg_made'
            when d.decision = 'field_goal' then 'fg_missed'
        end                                             as outcome,
        d.half_seconds_remaining <= 120                 as is_final_two_minutes,
        n.clock_runoff_seconds
    from {{ ref('fct_fourth_downs') }} d
    inner join {{ ref('int_next_snap') }} n using (play_uid)
    where d.season between 2006 and 2022
      and d.qtr <= 4
      and not d.is_nullified_by_penalty
      and n.is_next_snap_same_half
      and n.clock_runoff_seconds >= 0

)

select
    outcome,
    is_final_two_minutes,
    count(*)                                            as plays,
    median(clock_runoff_seconds)                        as median_runoff_seconds
from outcomes
where outcome is not null
group by all
