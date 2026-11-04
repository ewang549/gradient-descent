-- Punt model rows: each clean punt and where the receiving team snapped the ball next.
-- Excluded: punts wiped out by penalty, and outcomes with no receiving-team snap (return TDs,
-- muffs recovered by the punting team, punts that end the half).

select
    d.play_uid,
    d.game_id,
    d.season,
    d.week,
    d.posteam,
    d.yardline_100                                      as punt_yardline_100,
    n.next_snap_yardline_100                            as receiving_yardline_100,  -- receiver's distance to the end zone
    n.clock_runoff_seconds

from {{ ref('fct_fourth_downs') }} d
inner join {{ ref('int_next_snap') }} n using (play_uid)
where d.decision = 'punt'
  and not d.is_nullified_by_penalty
  and n.next_snap_posteam = d.defteam
  and n.is_next_snap_same_half
