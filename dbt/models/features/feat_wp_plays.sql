{#- Win-probability model rows: regulation scrimmage plays. Every feature is known before the
    snap; the label is the final result. -#}

select
    play_uid,
    game_id,
    season,
    week,

    -- features (all pre-snap)
    score_differential,
    score_differential / sqrt(game_seconds_remaining + 1)    as score_diff_per_sqrt_sec,  -- a lead matters more late
    game_seconds_remaining,
    half_seconds_remaining,
    down,
    ydstogo,
    yardline_100,
    posteam_timeouts_remaining,
    defteam_timeouts_remaining,
    -- +1 home, -1 away, 0 neutral site (a 0/1 flag would lump neutral-site games in with road games)
    case when is_neutral_site then 0 when is_posteam_home then 1 else -1 end as home,
    posteam_spread_line,
    spread_time,
    is_receiving_2h_kickoff::int                              as is_receiving_2h_kickoff,

    -- label: did the possession team win? null for ties (excluded from training)
    case posteam_game_result when 'win' then 1 when 'loss' then 0 end as label_win,

    -- benchmarks
    nflverse_wp,
    nflverse_vegas_wp

from {{ ref('fct_plays') }}
where qtr <= 4               -- regulation only: overtime has different rules and its own clock
  and down is not null       -- scrimmage plays (kickoffs, PATs and 2-pt tries have no down)
