-- int_next_snap: for every play, the next SCRIMMAGE snap in the same game (kickoffs, PATs and
-- two-point tries are skipped). Answers "who had the ball next, where, and how much clock ran".
--
-- An ASOF join matches each play to the nearest scrimmage play after it, which is simpler and
-- faster than a correlated subquery.

with plays as (

    select play_uid, game_id, play_seq, game_half, game_seconds_remaining
    from {{ ref('stg_pbp') }}

),

scrimmage as (

    select game_id, play_seq, play_uid, posteam, yardline_100, game_half, game_seconds_remaining
    from {{ ref('stg_pbp') }}
    where down is not null

)

select
    p.play_uid,
    s.play_uid                                      as next_snap_play_uid,
    s.posteam                                       as next_snap_posteam,
    s.yardline_100                                  as next_snap_yardline_100,
    s.game_half = p.game_half                       as is_next_snap_same_half,
    p.game_seconds_remaining - s.game_seconds_remaining as clock_runoff_seconds

from plays p
asof left join scrimmage s
    on p.game_id = s.game_id
   and p.play_seq < s.play_seq
