-- Leakage guard: when a timeout is called right AFTER a snap, nflverse records the reduced
-- count on that snap's own row. Our pre-snap count must still include the timeout, i.e. be
-- exactly one higher than nflverse's count for the team that called it.
-- Exception: "Timeout #4", a lost challenge charged to a team that already had 0 timeouts
-- (2004 CHI@DET, 2008 SF@ARI). The count was 0 before and after, so there's nothing to add back.
select p.play_uid, p.posteam, r.timeout_team, p.posteam_timeouts_remaining, p.defteam_timeouts_remaining,
       r.posteam_timeouts_remaining as nflverse_posteam_to, r.defteam_timeouts_remaining as nflverse_defteam_to
from {{ ref('stg_pbp') }} p
inner join {{ source('raw', 'pbp') }} r
    on r.game_id = p.game_id and cast(r.play_id as integer) = p.play_id
where r.timeout = 1
  and r.play_type in ('pass', 'run')
  and r.game_half <> 'Overtime'
  and r."desc" not ilike '%timeout #4%'
  and (
        (r.timeout_team = p.posteam and p.posteam_timeouts_remaining <> r.posteam_timeouts_remaining + 1)
     or (r.timeout_team = p.defteam and p.defteam_timeouts_remaining <> r.defteam_timeouts_remaining + 1)
  )
