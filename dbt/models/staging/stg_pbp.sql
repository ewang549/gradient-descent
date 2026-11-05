{#-
    stg_pbp: one row per real play (scrimmage snaps, kicks, and penalty "no plays").
    Administrative rows (timeouts, quarter ends, two-minute warnings, game start) are removed.

    Data quirks handled here, each verified against the raw data:
      1. play_id is not chronological (timeout rows get out-of-order ids); order_sequence is.
      2. When a timeout is called right after a snap, nflverse writes the already-decremented
         count on the snap's own row. That would leak the future into the pre-snap state, so
         pre-snap timeouts come from the previous event (lag over the full, unfiltered stream).
      3. In 1999, ~400 real plays with penalties have play_type = NULL. Their type is inferred
         from nflverse's pass/rush/kick flags instead of silently dropping them.
      4. total_home_score / total_away_score are POST-play scores. Only posteam_score,
         defteam_score and score_differential describe the score before the snap. ~500 kickoffs
         in 1999-2000 lack them; we fall back to the scoreboard after the previous event, which
         matches nflverse's own pre-play score on 99.996% of plays where both exist.
      5. Some 1999-2002 rows use '' instead of NULL for posteam / play_type.
      6. Placeholder rows ("*** play under review ***") and stat-note comments mislabeled as
         passes have no field position; every real play has a spot, so we require one.
      7. One double-overtime game (2003 CAR@STL) has a timeout counter of -1; clamped to 0-3.
-#}

with source as (

    select * replace (nullif(posteam, '') as posteam, nullif(play_type, '') as play_type)
    from {{ source('raw', 'pbp') }}

),

-- Window over EVERY event (timeouts included) so lag() sees the true previous state.
events as (

    select
        *,
        coalesce(lag(home_timeouts_remaining) over half_events, home_timeouts_remaining) as home_timeouts_pre_snap,
        coalesce(lag(away_timeouts_remaining) over half_events, away_timeouts_remaining) as away_timeouts_pre_snap,
        coalesce(last_value(total_home_score ignore nulls) over prior_events, 0)          as home_score_before,
        coalesce(last_value(total_away_score ignore nulls) over prior_events, 0)          as away_score_before,
        coalesce(
            play_type,
            case
                when timeout = 1 then null
                when pass = 1 then 'pass'
                when rush = 1 then 'run'
                when punt_attempt = 1 then 'punt'
                when field_goal_attempt = 1 then 'field_goal'
                when kickoff_attempt = 1 then 'kickoff'
                when extra_point_attempt = 1 then 'extra_point'
            end
        ) as play_type_clean
    from source
    window
        half_events as (partition by game_id, game_half order by order_sequence, play_id),
        prior_events as (
            partition by game_id order by order_sequence, play_id
            rows between unbounded preceding and 1 preceding
        )

),

real_plays as (

    select *
    from events
    where posteam is not null
      and play_type_clean is not null
      and yardline_100 is not null
      and "desc" <> '*** play under review ***'
      and coalesce(play_deleted, 0) = 0
      -- pure timeouts: 'no_play' rows flagged as a timeout, with no penalty
      and not (play_type_clean = 'no_play' and coalesce(timeout, 0) = 1 and coalesce(penalty, 0) = 0)

)

select
    -- keys & ordering
    game_id || '_' || cast(cast(play_id as integer) as varchar)                    as play_uid,
    game_id,
    cast(play_id as integer)                                                       as play_id,
    row_number() over (partition by game_id order by order_sequence, play_id)      as play_seq,
    season,
    week,
    season_type,
    cast(game_date as date)                                                        as game_date,

    -- teams (current franchise abbreviations in every season)
    home_team,
    away_team,
    posteam,
    defteam,
    posteam = home_team                                                            as is_posteam_home,

    -- clock (pre-snap)
    cast(qtr as integer)                                                           as qtr,
    game_half,
    game_half = 'Overtime'                                                         as is_overtime,
    "time"                                                                         as clock,
    cast(quarter_seconds_remaining as integer)                                     as quarter_seconds_remaining,
    cast(half_seconds_remaining as integer)                                        as half_seconds_remaining,
    cast(game_seconds_remaining as integer)                                        as game_seconds_remaining,

    -- down, distance, field position (pre-snap)
    cast(down as integer)                                                          as down,
    cast(ydstogo as integer)                                                       as ydstogo,
    cast(yardline_100 as integer)                                                  as yardline_100,
    yrdln                                                                          as yardline_label,
    coalesce(goal_to_go, 0) = 1                                                    as is_goal_to_go,

    -- score before the snap (quirk 4)
    cast(coalesce(posteam_score, if(posteam = home_team, home_score_before, away_score_before)) as integer) as posteam_score,
    cast(coalesce(defteam_score, if(posteam = home_team, away_score_before, home_score_before)) as integer) as defteam_score,
    cast(coalesce(
        score_differential,
        if(posteam = home_team, home_score_before - away_score_before, away_score_before - home_score_before)
    ) as integer)                                                                  as score_differential,

    -- timeouts before the snap (quirks 2 and 7)
    cast(greatest(0, least(3, if(posteam = home_team, home_timeouts_pre_snap, away_timeouts_pre_snap))) as integer) as posteam_timeouts_remaining,
    cast(greatest(0, least(3, if(posteam = home_team, away_timeouts_pre_snap, home_timeouts_pre_snap))) as integer) as defteam_timeouts_remaining,

    -- what kind of play
    play_type_clean                                                                as play_type,
    play_type is null                                                              as is_play_type_inferred,
    "desc"                                                                         as play_description,
    coalesce(pass, 0) = 1                                                          as is_pass,  -- dropbacks incl. sacks/scrambles and plays wiped out by penalty
    coalesce(rush, 0) = 1                                                          as is_rush,
    coalesce(special, 0) = 1                                                       as is_special_teams,
    coalesce(qb_kneel, 0) = 1                                                      as is_qb_kneel,
    coalesce(qb_spike, 0) = 1                                                      as is_qb_spike,
    coalesce(two_point_attempt, 0) = 1                                             as is_two_point_attempt,
    coalesce(aborted_play, 0) = 1                                                  as is_aborted,
    coalesce(shotgun, 0) = 1                                                       as is_shotgun,
    coalesce(no_huddle, 0) = 1                                                     as is_no_huddle,
    coalesce(penalty, 0) = 1                                                       as is_penalty,
    penalty_team,
    penalty_type,
    cast(penalty_yards as integer)                                                 as penalty_yards,

    -- what happened (post-play: never a pre-play feature)
    cast(yards_gained as integer)                                                  as yards_gained,
    coalesce(first_down, 0) = 1                                                    as is_first_down,
    coalesce(touchdown, 0) = 1                                                     as is_touchdown,
    td_team,
    coalesce(interception, 0) = 1                                                  as is_interception,
    coalesce(fumble_lost, 0) = 1                                                   as is_fumble_lost,
    coalesce(safety, 0) = 1                                                        as is_safety,
    field_goal_result,
    extra_point_result,
    two_point_conv_result,
    cast(kick_distance as integer)                                                 as kick_distance,
    cast(return_yards as integer)                                                  as return_yards,
    coalesce(punt_blocked, 0) = 1                                                  as is_punt_blocked,
    coalesce(touchback, 0) = 1                                                     as is_touchback,
    cast(total_home_score as integer)                                              as home_score_post,
    cast(total_away_score as integer)                                              as away_score_post,
    cast(score_differential_post as integer)                                       as score_differential_post,
    epa,
    success = 1                                                                    as is_success,

    -- passing detail (post-play; Phase 4 findings)
    coalesce(qb_dropback, 0) = 1                                                   as is_qb_dropback,
    coalesce(qb_scramble, 0) = 1                                                   as is_qb_scramble,
    coalesce(sack, 0) = 1                                                          as is_sack,
    coalesce(pass_attempt, 0) = 1 and coalesce(sack, 0) = 0                        as is_pass_attempt,
    air_yards,
    cpoe,
    passer_player_id,
    passer_player_name,
    xpass                                                                          as nflverse_xpass,

    -- nflverse model outputs: Phase 2 benchmarks (note: their models were fit on every season)
    ep                                                                             as nflverse_ep,
    wp                                                                             as nflverse_wp,
    vegas_wp                                                                       as nflverse_vegas_wp,
    wpa                                                                            as nflverse_wpa,

    -- drive context
    cast(fixed_drive as integer)                                                   as drive_number,
    fixed_drive_result                                                             as drive_result,

    _ingested_at

from real_plays
