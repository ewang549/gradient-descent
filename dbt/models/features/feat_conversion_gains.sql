-- Average yards gained on a successful 4th-down conversion, by yards to go (10 = 10+).
-- Goal-to-go conversions are touchdowns by definition, so they're left out.
-- Training seasons only (2006-2022).

select
    least(ydstogo, 10)                                  as ydstogo_capped,
    count(*)                                            as conversions,
    avg(yards_gained)                                   as avg_yards_gained
from {{ ref('feat_go_attempts') }}
where label_converted = 1
  and is_goal_to_go = 0
  and season between 2006 and 2022
group by 1
