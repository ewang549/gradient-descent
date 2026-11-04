-- stg_rosters: one row per player per team per season (season-level snapshot).
-- Not used by the Phase 1 marts; staged now for QB/kicker features later.
-- nflverse repeats a few players within a team-season (1999-2011, e.g. Fred Taylor, JAX 1999);
-- keep one row per player-team-season.

select
    season,
    {{ current_team_abbr('team') }}            as team,
    gsis_id                                    as player_id,
    full_name,
    first_name,
    last_name,
    football_name,
    position,
    depth_chart_position,
    ngs_position,
    try_cast(jersey_number as integer)         as jersey_number,
    status,
    birth_date,
    height                                     as height_in,
    weight                                     as weight_lb,
    college,
    years_exp,
    entry_year,
    rookie_year,
    draft_club,
    draft_number,
    headshot_url,
    espn_id,
    pfr_id,
    pff_id,
    sleeper_id,
    sportradar_id

from {{ source('raw', 'rosters') }}
qualify gsis_id is null
     or row_number() over (partition by season, team, gsis_id order by week desc nulls last) = 1
